import React, { FunctionComponent } from "react";
import { Styles } from "./styles";
import { Gutter } from "../../../../components/gutter";
import { TextInput } from "../../../../components/input";
import { ColorPalette } from "../../../../styles";
import { BIP44PathState } from "./state";
import { observer } from "mobx-react-lite";

const CloseSvg: FunctionComponent<{ size: number | string; color: string }> = ({
  size,
  color,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
};

export const SetBip44PathCard: FunctionComponent<{
  coinType?: number;

  state: BIP44PathState;

  onClose: () => void;
}> = observer(({ coinType, state, onClose }) => {
  return (
    <Styles.Container>
      <Styles.Title>Set Custom Derivation Path</Styles.Title>
      <Styles.CloseContainer
        onClick={(e) => {
          e.preventDefault();

          // TODO: Add alert saying that the setup will be reset.
          state.reset();
          onClose();
        }}
      >
        <CloseSvg size="1.5rem" color={ColorPalette["gray-300"]} />
      </Styles.CloseContainer>
      <Gutter size="1.125rem" />
      <ul>
        <li>You can create multiple addresses from one recovery phrase</li>
        <li>A lost path cannot be recovered</li>
        <li>
          If you{`'`}re unfamiliar with this feature, skip or undo this step{" "}
          {`->`} Reset Settings
        </li>
      </ul>
      <Gutter size="1.5rem" />
      <Styles.SubTitle>HD Derivation Path</Styles.SubTitle>
      <Gutter size="0.5rem" />
      <Styles.InputsContainer>
        <div>{`m/44'/${coinType != null ? coinType : "..."}'`}</div>
        <Gutter size="0.5rem" />
        <Styles.InputContainer>
          <TextInput
            type="number"
            min={0}
            value={state.accountText}
            onChange={(e) => {
              e.preventDefault();

              state.setAccountText(e.target.value);
            }}
            errorBorder={!state.isAccountValid()}
          />
        </Styles.InputContainer>
        <Gutter size="0.5rem" />
        <Styles.LightText>{`'/`}</Styles.LightText>
        <Gutter size="0.5rem" />
        <Styles.InputContainer>
          <TextInput
            type="number"
            min={0}
            max={1}
            value={state.changeText}
            onChange={(e) => {
              e.preventDefault();

              state.setChangeText(e.target.value);
            }}
            errorBorder={!state.isChangeValid()}
          />
        </Styles.InputContainer>
        <Gutter size="0.5rem" />
        <Styles.LightText>/</Styles.LightText>
        <Gutter size="0.5rem" />
        <Styles.InputContainer>
          <TextInput
            type="number"
            min={0}
            value={state.addressIndexText}
            onChange={(e) => {
              e.preventDefault();

              state.setAddressIndexText(e.target.value);
            }}
            errorBorder={!state.isAddressIndexValid()}
          />
        </Styles.InputContainer>
      </Styles.InputsContainer>
    </Styles.Container>
  );
});