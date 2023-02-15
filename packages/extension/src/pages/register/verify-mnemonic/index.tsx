import React, {
  FunctionComponent,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  RegisterSceneBox,
  RegisterSceneBoxHeader,
} from "../components/register-scene-box";
import { Stack } from "../../../components/stack";
import { useSceneTransition } from "../../../components/transition";
import { TextInput } from "../../../components/input";
import { Button } from "../../../components/button";
import { Gutter } from "../../../components/gutter";
import { VerifyingMnemonicBox, VerifyingMnemonicBoxRef } from "./verifying-box";
import { Styles } from "./styles";
import { useForm } from "react-hook-form";

interface FormData {
  name: string;
  password: string;
  confirmPassword: string;
}

export const VerifyMnemonicScene: FunctionComponent<{
  mnemonic?: string;
  bip44Path?: {
    account: number;
    change: number;
    addressIndex: number;
  };
}> = ({ mnemonic, bip44Path }) => {
  const sceneTransition = useSceneTransition();

  useLayoutEffect(() => {
    if (!mnemonic || !bip44Path) {
      throw new Error("Mnemonic and bip44Path should be provided");
    }
  }, [mnemonic, bip44Path]);

  const verifyingWords = useMemo(() => {
    if (!mnemonic) {
      throw new Error("Null mnemonic");
    }

    if (mnemonic.trim() === "") {
      throw new Error("Empty mnemonic");
    }

    const words = mnemonic.split(" ").map((w) => w.trim());
    const num = words.length;
    const one = Math.floor(Math.random() * num);
    const two = (() => {
      let r = Math.floor(Math.random() * num);
      while (r === one) {
        r = Math.floor(Math.random() * num);
      }
      return r;
    })();

    return [
      {
        index: one,
        word: words[one],
      },
      {
        index: two,
        word: words[two],
      },
    ].sort((word1, word2) => {
      return word1.index < word2.index ? -1 : 1;
    });
  }, [mnemonic]);

  const verifyingBoxRef = useRef<VerifyingMnemonicBoxRef | null>(null);

  const form = useForm<FormData>({
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <RegisterSceneBox>
      <RegisterSceneBoxHeader>Back Up Your Mnemonic</RegisterSceneBoxHeader>
      <form
        onSubmit={form.handleSubmit((data) => {
          console.log(data);

          if (!verifyingBoxRef.current) {
            throw new Error("Ref of verify box is null");
          }

          if (verifyingBoxRef.current.validate()) {
            alert("TODO");
            sceneTransition.pop();
          }
        })}
      >
        <Styles.VerifyInfoText>
          Confirm your mnemonic by filling in the words according to their
          number.
        </Styles.VerifyInfoText>
        <Gutter size="0.75rem" />
        <VerifyingMnemonicBox ref={verifyingBoxRef} words={verifyingWords} />
        <Gutter size="1.75rem" />
        <Stack>
          <TextInput
            label="Name"
            {...form.register("name", {
              required: true,
            })}
            error={
              form.formState.errors.name && form.formState.errors.name.message
            }
          />
          <TextInput
            label="Password"
            {...form.register("password", {
              required: true,
            })}
            error={
              form.formState.errors.password &&
              form.formState.errors.password.message
            }
          />
          <TextInput
            label="Verify password"
            {...form.register("confirmPassword", {
              required: true,
            })}
            error={
              form.formState.errors.confirmPassword &&
              form.formState.errors.confirmPassword.message
            }
          />
          <Gutter size="1rem" />
          <Button text="Next" type="submit" />
        </Stack>
      </form>
    </RegisterSceneBox>
  );
};