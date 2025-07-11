import { useAccount } from "wagmi";
import { SuccessStepPresentational } from "./Presentational";
import { useAppContext } from "../../../../contexts/AppContext";

export const SuccessStep = () => {
  const { chain } = useAccount();
  const { state } = useAppContext();
  const verificationResults = state.verificationResults;

  const tx = verificationResults?.txHash || "";
  const handle = "";

  return (
    <SuccessStepPresentational
      tx={tx}
      handle={handle}
      blockExplorer={"https://base-sepolia.blockscout.com/"}
    />
  );
};
