import { RecipientConfig } from "../tx";
import { ChainGetter } from "@keplr-wallet/stores";
import { IIBCChannelConfig } from "./types";
import { useState } from "react";

/**
 * IBCRecipientConfig returns the recipient config for IBC transfer.
 * The recipient config's chain id should be the destination chain id for IBC.
 * But, actually, the recipient config's chain id would be set as the sending chain id if the channel not set.
 * So, you should remember that the recipient config's chain id is equal to the sending chain id, if channel not set.
 */
export class IBCRecipientConfig extends RecipientConfig {
  constructor(
    chainGetter: ChainGetter,
    initialChainId: string,
    protected readonly channelConfig: IIBCChannelConfig
  ) {
    super(chainGetter, initialChainId);
  }

  override get chainId(): string {
    return this.channelConfig.channel
      ? this.channelConfig.channel.counterpartyChainId
      : super.chainId;
  }
}

export const useIBCRecipientConfig = (
  chainGetter: ChainGetter,
  chainId: string,
  channelConfig: IIBCChannelConfig,
  options: {
    allowHexAddressOnEthermint?: boolean;
    icns?: {
      chainId: string;
      resolverContractAddress: string;
    };
  } = {}
) => {
  const [config] = useState(
    () => new IBCRecipientConfig(chainGetter, chainId, channelConfig)
  );
  config.setChain(chainId);
  config.setAllowHexAddressOnEthermint(options.allowHexAddressOnEthermint);
  config.setICNS(options.icns);

  return config;
};
