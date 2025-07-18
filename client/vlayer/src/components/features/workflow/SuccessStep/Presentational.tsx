import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { useAppContext } from "../../../../contexts/AppContext";
import { STEP_KIND } from "../../../../utils/steps";

export const SuccessStepPresentational = ({
  tx,
  handle,
  blockExplorer,
}: {
  tx: string;
  handle: string;
  blockExplorer?: string;
}) => {
  const { goToStepByKind } = useAppContext();

  const handleStartAgain = () => {
    goToStepByKind(STEP_KIND.WELCOME);
  };

  return (
    <>
      <p className="text-gray-500">
        @{handle} was minted to{" "}
        <a
          href={`${blockExplorer}/tx/${tx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-500 underline"
        >
          {tx.slice(0, 6)}...{tx.slice(-4)}
        </a>
      </p>
      <p className="text-gray-500">
        <a
          href={`${blockExplorer}/tx/${tx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold leading-4 text-center text-indigo-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 inline-flex items-center"
          tabIndex={0}
        >
          See it on block explorer
          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 ml-1" />
        </a>
      </p>
      <div className="mt-2 flex justify-center">
        <button
          onClick={handleStartAgain}
          id="nextButton"
          className="text-indigo-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Start again
        </button>
      </div>
    </>
  );
};
