import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../ui/card";
import { Badge } from "../../../ui/badge";
import { Button } from "../../../ui/button";
import { IPFSMetadata } from "../../../ui/IPFSMetadata";
import { CreateProposal } from "../proposals/CreateProposal";
import { Proposal } from "../../../../types/dao";
import {
  formatDateTime,
  getProposalStatusBadgeProps,
  getProposalPhase,
} from "../../../../utils/daoHelpers";
import { daoService } from "../../../../services/daoService";

interface DAOProposalsTabProps {
  proposals: Proposal[] | undefined;
  daoId: string;
  daoName: string;
  isOwner: boolean;
  onProposalCreated: () => void;
  onProposalClick?: (proposalId: string) => void;
  showOnlyActive?: boolean;
}

// Helper function to sort proposals
const sortProposals = (
  proposals: Proposal[],
  showOnlyActive: boolean
): Proposal[] => {
  if (!proposals) return [];

  const now = new Date();

  return [...proposals].sort((a, b) => {
    const phaseA = getProposalPhase(a);
    const phaseB = getProposalPhase(b);

    if (showOnlyActive) {
      const phaseOrder = { voting: 0, feedback: 1, upcoming: 2 };
      const orderA = phaseOrder[phaseA as keyof typeof phaseOrder] ?? 3;
      const orderB = phaseOrder[phaseB as keyof typeof phaseOrder] ?? 3;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      if (phaseA === "upcoming") {
        return (
          new Date(a.voting_start).getTime() -
          new Date(b.voting_start).getTime()
        );
      } else if (phaseA === "voting") {
        return (
          new Date(a.voting_end).getTime() - new Date(b.voting_end).getTime()
        );
      } else if (phaseA === "feedback") {
        return (
          new Date(a.feedback_end).getTime() -
          new Date(b.feedback_end).getTime()
        );
      }
    } else {
      return (
        new Date(b.feedback_end).getTime() - new Date(a.feedback_end).getTime()
      );
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

const getPhaseBadge = (proposal: Proposal) => {
  const phase = getProposalPhase(proposal);
  const now = new Date();

  switch (phase) {
    case "voting":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 animate-pulse">
          🔴 Live Voting
        </Badge>
      );
    case "feedback":
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 animate-pulse">
          💬 Live Feedback
        </Badge>
      );
    case "upcoming":
      const timeToStart =
        new Date(proposal.voting_start).getTime() - now.getTime();
      const daysToStart = Math.ceil(timeToStart / (1000 * 60 * 60 * 24));
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          ⏰ Starts in {daysToStart} day{daysToStart !== 1 ? "s" : ""}
        </Badge>
      );
    case "ended":
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          ✅ Ended
        </Badge>
      );
    default:
      return null;
  }
};

export const DAOProposalsTab: React.FC<DAOProposalsTabProps> = ({
  proposals,
  daoId,
  daoName,
  isOwner,
  onProposalCreated,
  onProposalClick,
  showOnlyActive = true,
}) => {
  const sortedProposals = sortProposals(proposals || [], showOnlyActive);
  const [isCheckingConclusions, setIsCheckingConclusions] =
    React.useState(false);

  React.useEffect(() => {
    const checkAndConcludeProposals = async () => {
      if (!proposals || proposals.length === 0) return;

      try {
        const result = await daoService.autoConcludeProposals(proposals);

        if (result.total > 0) {
          console.log(
            `🔄 Checked ${proposals.length} proposals, concluded ${result.total} phases`
          );

          const successfulConclusions = result.concluded.filter(
            (r) => r.success
          );
          if (successfulConclusions.length > 0) {
            console.log(
              `✅ Successfully concluded ${successfulConclusions.length} proposal phases`
            );
            // Trigger a refresh of the proposals data
            onProposalCreated();
          }

          // Log any failures
          const failures = result.concluded.filter((r) => !r.success);
          if (failures.length > 0) {
            console.warn(
              `⚠️ Failed to conclude ${failures.length} proposal phases:`,
              failures
            );
          }
        }
      } catch (error) {
        console.error("Error during auto-conclusion check:", error);
      }
    };

    // Run the check when proposals change
    checkAndConcludeProposals();
  }, [proposals, onProposalCreated]);

  // Manual conclusion check for owners
  const handleManualConclusionCheck = async () => {
    if (!proposals || proposals.length === 0) return;

    setIsCheckingConclusions(true);
    try {
      const result = await daoService.autoConcludeProposals(proposals);

      if (result.total > 0) {
        const successfulConclusions = result.concluded.filter((r) => r.success);
        if (successfulConclusions.length > 0) {
          onProposalCreated(); // Refresh data
        }

        // Show a simple alert with results
        alert(
          `Conclusion check complete:\n✅ ${
            successfulConclusions.length
          } phases concluded\n❌ ${
            result.concluded.filter((r) => !r.success).length
          } failures`
        );
      } else {
        alert("No proposals needed conclusion at this time.");
      }
    } catch (error) {
      console.error("Error during manual conclusion check:", error);
      alert(
        "Error occurred during conclusion check. Check console for details."
      );
    } finally {
      setIsCheckingConclusions(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Proposal Section - Only for owners and active tab */}
      {isOwner && showOnlyActive && (
        <CreateProposal
          daoId={daoId}
          daoName={daoName}
          onProposalCreated={onProposalCreated}
        />
      )}

      {/* Manual Conclusion Check - Only for owners */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Admin Tools</CardTitle>
            <CardDescription className="text-xs">
              Manually check and conclude proposals that have exceeded their
              time limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleManualConclusionCheck}
              disabled={isCheckingConclusions}
              size="sm"
              variant="outline"
            >
              {isCheckingConclusions
                ? "Checking..."
                : "🔄 Check & Conclude Proposals"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Proposals List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {showOnlyActive ? "Active Proposals" : "Ended Proposals"}
          </CardTitle>
          <CardDescription>
            {showOnlyActive
              ? `Live and upcoming proposals for ${daoName}`
              : `Completed proposals for ${daoName}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedProposals && sortedProposals.length > 0 ? (
            <div className="space-y-4">
              {sortedProposals.map((proposal, index) => {
                const statusBadge = getProposalStatusBadgeProps(
                  proposal.conclusion || "pending"
                );
                const phaseBadge = getPhaseBadge(proposal);
                const phase = getProposalPhase(proposal);
                const isHighlighted =
                  phase === "voting" || phase === "feedback";

                return (
                  <Card
                    key={index}
                    className={
                      isHighlighted ? "ring-2 ring-primary/20 bg-primary/5" : ""
                    }
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            {proposal.title}
                          </CardTitle>
                          <CardDescription className="mt-2">
                            {proposal.description}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          {phaseBadge}
                          {!showOnlyActive && (
                            <Badge className={statusBadge.className}>
                              {statusBadge.text}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            House {proposal.voting_house}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Voting Start
                          </p>
                          <p>{formatDateTime(proposal.voting_start)}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Voting End
                          </p>
                          <p>{formatDateTime(proposal.voting_end)}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Feedback End
                          </p>
                          <p>{formatDateTime(proposal.feedback_end)}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Created
                          </p>
                          <p>{formatDateTime(proposal.created_at)}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {!showOnlyActive && (
                              <>
                                <p className="text-sm font-medium">
                                  Voting Result:{" "}
                                  <span className="text-primary">
                                    {proposal.conclusion}
                                  </span>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Feedback Result:{" "}
                                  {proposal.feedback_conclusion}
                                </p>
                              </>
                            )}
                            {showOnlyActive && (
                              <p className="text-sm text-muted-foreground">
                                Phase:{" "}
                                <span className="font-medium capitalize">
                                  {phase}
                                </span>
                              </p>
                            )}
                            {/* IPFS Metadata Display */}
                            {proposal.akave_url && (
                              <div className="mt-2">
                                <IPFSMetadata
                                  akaveUrl={proposal.akave_url}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-xs text-muted-foreground font-mono">
                              ID: {proposal.proposal_id.slice(0, 8)}...
                            </p>
                            <Badge variant="outline" className="text-xs">
                              💬 Chat Available
                            </Badge>
                            {onProposalClick && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  onProposalClick(proposal.proposal_id)
                                }
                              >
                                View Details
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {showOnlyActive
                  ? "No active proposals found"
                  : "No ended proposals found"}
              </p>
              {isOwner && showOnlyActive && (
                <p className="text-sm text-muted-foreground mt-2">
                  Create the first proposal for this DAO above!
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
