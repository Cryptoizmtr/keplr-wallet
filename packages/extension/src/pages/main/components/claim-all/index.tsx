import React, { FunctionComponent, useRef, useState } from "react";
import { Column, Columns } from "../../../../components/column";
import { Button } from "../../../../components/button";
import { Stack } from "../../../../components/stack";
import { Box } from "../../../../components/box";
import { VerticalCollapseTransition } from "../../../../components/transition/vertical-collapse";
import { Body2, Subtitle2, Subtitle3 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";
import { ViewToken } from "../../index";
import styled from "styled-components";
import { ArrowDownIcon, ArrowUpIcon } from "../../../../components/icon";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Dec, Int, PricePretty } from "@keplr-wallet/unit";
import { AminoSignResponse, StdSignDoc } from "@keplr-wallet/types";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { PrivilegeCosmosSignAminoWithdrawRewardsMsg } from "@keplr-wallet/background";
import { action, makeObservable, observable } from "mobx";

const Styles = {
  Container: styled.div`
    background-color: ${ColorPalette["gray-600"]};
    padding: 0.75rem 0 0 0;
    border-radius: 0.375rem;
  `,
  ExpandButton: styled(Box)`
    :hover {
      background-color: ${ColorPalette["gray-500"]};
      opacity: 0.5;
    }

    :active {
      background-color: ${ColorPalette["gray-500"]};
      opacity: 0.2;
    }
  `,
};

// XXX: 좀 이상하긴 한데 상위/하위 컴포넌트가 state를 공유하기 쉽게하려고 이렇게 한다...
class ClaimAllEachState {
  @observable
  isLoading: boolean = false;

  @observable
  failedReason: Error | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  setIsLoading(value: boolean): void {
    this.isLoading = value;
  }

  @action
  setFailedReason(value: Error | undefined): void {
    this.isLoading = false;
    this.failedReason = value;
  }
}

export const ClaimAll: FunctionComponent = observer(() => {
  const { chainStore, accountStore, queriesStore, priceStore } = useStore();

  const statesRef = useRef(new Map<string, ClaimAllEachState>());
  const getClaimAllEachState = (chainId: string): ClaimAllEachState => {
    const chainIdentifier = chainStore.getChain(chainId).chainIdentifier;
    let state = statesRef.current.get(chainIdentifier);
    if (!state) {
      state = new ClaimAllEachState();
      statesRef.current.set(chainIdentifier, state);
    }

    return state;
  };

  const viewTokens: ViewToken[] = chainStore.chainInfosInUI
    .map((chainInfo) => {
      const chainId = chainInfo.chainId;
      const accountAddress = accountStore.getAccount(chainId).bech32Address;
      const queries = queriesStore.get(chainId);

      return {
        token:
          queries.cosmos.queryRewards.getQueryBech32Address(accountAddress)
            .stakableReward,
        chainInfo,
      };
    })
    .filter((viewToken) => viewToken.token.toDec().gt(new Dec(0)));

  const [isExpanded, setIsExpanded] = useState(true);

  const totalPrice = (() => {
    const fiatCurrency = priceStore.getFiatCurrency(
      priceStore.defaultVsCurrency
    );
    if (!fiatCurrency) {
      return undefined;
    }

    let res = new PricePretty(fiatCurrency, 0);

    for (const viewToken of viewTokens) {
      const price = priceStore.calculatePrice(viewToken.token);
      if (price) {
        res = res.add(price);
      }
    }

    return res;
  })();

  const claimAll = () => {
    if (viewTokens.length > 0) {
      setIsExpanded(false);
    }

    for (const viewToken of viewTokens) {
      const chainId = viewToken.chainInfo.chainId;
      const account = accountStore.getAccount(chainId);

      if (!account.bech32Address) {
        continue;
      }

      const chainInfo = chainStore.getChain(chainId);
      const queries = queriesStore.get(chainId);
      const queryRewards = queries.cosmos.queryRewards.getQueryBech32Address(
        account.bech32Address
      );

      const validatorAddresses =
        queryRewards.getDescendingPendingRewardValidatorAddresses(8);

      if (validatorAddresses.length === 0) {
        continue;
      }

      const state = getClaimAllEachState(chainId);

      state.setIsLoading(true);

      const tx =
        account.cosmos.makeWithdrawDelegationRewardTx(validatorAddresses);

      (async () => {
        // At present, only assume that user can pay the fee with the stake currency.
        // (Normally, user has stake currency because it is used for staking)
        const feeCurrency = chainInfo.feeCurrencies.find(
          (cur) =>
            cur.coinMinimalDenom === chainInfo.stakeCurrency.coinMinimalDenom
        );
        if (feeCurrency) {
          try {
            const simulated = await tx.simulate();

            // Gas adjustment is 1.5
            // Since there is currently no convenient way to adjust the gas adjustment on the UI,
            // Use high gas adjustment to prevent failure.
            const gasEstimated = new Dec(simulated.gasUsed * 1.5).truncate();
            const fee = {
              denom: feeCurrency.coinMinimalDenom,
              amount: new Dec(feeCurrency.gasPriceStep?.average ?? 0.025)
                .mul(new Dec(gasEstimated))
                .roundUp()
                .toString(),
            };

            const balance = queries.queryBalances
              .getQueryBech32Address(account.bech32Address)
              .balances.find(
                (bal) =>
                  bal.currency.coinMinimalDenom === feeCurrency.coinMinimalDenom
              );

            if (!balance) {
              state.setFailedReason(
                new Error("Can't find balance for fee currency")
              );
              return;
            }

            await balance.waitResponse();

            if (
              new Dec(balance.balance.toCoin().amount).lt(new Dec(fee.amount))
            ) {
              state.setFailedReason(new Error("Not enough balance to pay fee"));
              return;
            }

            const stakableReward = queryRewards.stakableReward;
            if (
              new Dec(stakableReward.toCoin().amount).lte(new Dec(fee.amount))
            ) {
              console.log(
                `(${chainId}) Skip claim rewards. Fee: ${fee.amount}${
                  fee.denom
                } is greater than stakable reward: ${
                  stakableReward.toCoin().amount
                }${stakableReward.toCoin().denom}`
              );
              state.setFailedReason(
                new Error("TODO: 기대값보다 소모값이 더 높음")
              );
              return;
            }

            await tx.send(
              {
                gas: gasEstimated.toString(),
                amount: [fee],
              },
              "",
              {
                signAmino: async (
                  chainId: string,
                  signer: string,
                  signDoc: StdSignDoc
                ): Promise<AminoSignResponse> => {
                  const requester = new InExtensionMessageRequester();

                  return await requester.sendMessage(
                    BACKGROUND_PORT,
                    new PrivilegeCosmosSignAminoWithdrawRewardsMsg(
                      chainId,
                      signer,
                      signDoc
                    )
                  );
                },
              },
              {
                onFulfill: (tx: any) => {
                  state.setIsLoading(false);

                  if (tx.code) {
                    state.setFailedReason(new Error(tx["raw_log"]));
                  }
                },
              }
            );
          } catch (e) {
            state.setFailedReason(e);
            console.log(e);
            return;
          }
        } else {
          state.setFailedReason(
            new Error("Can't pay for fee by stake currency")
          );
          return;
        }
      })();
    }
  };

  const claimAllDisabled = (() => {
    if (viewTokens.length === 0) {
      return true;
    }

    for (const viewToken of viewTokens) {
      if (viewToken.token.toDec().gt(new Dec(0))) {
        return false;
      }
    }

    return true;
  })();

  // TODO: Add loading state.
  return (
    <Styles.Container>
      <Box paddingX="1rem">
        <Columns sum={1} alignY="center">
          <Column weight={1}>
            <Stack gutter="0.5rem">
              <Body2 style={{ color: ColorPalette["gray-300"] }}>
                Pending Staking Reward
              </Body2>
              <Subtitle2 style={{ color: ColorPalette["gray-10"] }}>
                {totalPrice ? totalPrice.separator(" ").toString() : "?"}
              </Subtitle2>
            </Stack>
          </Column>
          <Button
            text="Claim All"
            size="small"
            disabled={claimAllDisabled}
            onClick={claimAll}
          />
        </Columns>
      </Box>

      <Styles.ExpandButton
        paddingX="0.125rem"
        alignX="center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ArrowDownIcon width="1.25rem" height="1.25rem" />
        ) : (
          <ArrowUpIcon width="1.25rem" height="1.25rem" />
        )}
      </Styles.ExpandButton>

      <VerticalCollapseTransition collapsed={isExpanded}>
        {viewTokens.map((viewToken) => {
          return (
            <ClaimTokenItem
              key={`${viewToken.chainInfo.chainId}-${viewToken.token.currency.coinMinimalDenom}`}
              viewToken={viewToken}
              state={getClaimAllEachState(viewToken.chainInfo.chainId)}
            />
          );
        })}
      </VerticalCollapseTransition>
    </Styles.Container>
  );
});

const ClaimTokenItem: FunctionComponent<{
  viewToken: ViewToken;
  state: ClaimAllEachState;
}> = observer(({ viewToken, state }) => {
  const { accountStore, queriesStore } = useStore();

  // TODO: Add below property to config.ui.ts
  const defaultGasPerDelegation = 140000;

  const claim = async () => {
    const chainId = viewToken.chainInfo.chainId;
    const account = accountStore.getAccount(chainId);

    const queries = queriesStore.get(chainId);
    const queryRewards = queries.cosmos.queryRewards.getQueryBech32Address(
      account.bech32Address
    );

    const validatorAddresses =
      queryRewards.getDescendingPendingRewardValidatorAddresses(8);

    if (validatorAddresses.length === 0) {
      return;
    }

    const tx =
      account.cosmos.makeWithdrawDelegationRewardTx(validatorAddresses);

    let gas = new Int(validatorAddresses.length * defaultGasPerDelegation);

    try {
      const simulated = await tx.simulate();

      // Gas adjustment is 1.5
      // Since there is currently no convenient way to adjust the gas adjustment on the UI,
      // Use high gas adjustment to prevent failure.
      gas = new Dec(simulated.gasUsed * 1.5).truncate();
    } catch (e) {
      console.log(e);
    }

    await tx.send(
      {
        gas: gas.toString(),
        amount: [],
      },
      "",
      {},
      {
        onFulfill: (tx: any) => {
          console.log(tx.code, tx);
        },
      }
    );
  };

  const isLoading =
    accountStore.getAccount(viewToken.chainInfo.chainId).isSendingMsg ===
      "withdrawRewards" || state.isLoading;

  // TODO: Add loading state.
  return (
    <Box padding="1rem">
      <Columns sum={1} alignY="center">
        {viewToken.token.currency.coinImageUrl && (
          <img
            width="32px"
            height="32px"
            src={viewToken.token.currency.coinImageUrl}
          />
        )}
        <Column weight={1}>
          <Stack gutter="0.375rem">
            <Subtitle3 style={{ color: ColorPalette["gray-300"] }}>
              {viewToken.token.currency.coinDenom}
            </Subtitle3>
            <Subtitle2 style={{ color: ColorPalette["gray-10"] }}>
              {viewToken.token
                .maxDecimals(6)
                .shrink(true)
                .inequalitySymbol(true)
                .hideDenom(true)
                .toString()}
            </Subtitle2>
          </Stack>
        </Column>

        <Button
          text={isLoading ? "Loading" : "Claim"}
          size="small"
          color="secondary"
          disabled={viewToken.token.toDec().lte(new Dec(0))}
          onClick={claim}
        />
      </Columns>

      {state.failedReason ? (
        <div>{state.failedReason.message || state.failedReason.toString()}</div>
      ) : null}
    </Box>
  );
});