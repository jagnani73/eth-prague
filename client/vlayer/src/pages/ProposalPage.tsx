import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
  Progress,
  Separator,
  Button,
  Badge,
  IPFSMetadata,
} from "../components/ui";
import { ProposalWithVotes, VoteType, DAO, Member } from "../types/dao";
import { daoService } from "../services/daoService";
import { governanceService } from "../services/governanceService";
import { useGovernanceContract } from "../hooks/useGovernanceContract";
import {
  formatDateTime,
  getProposalStatusBadgeProps,
  getHouseBadgeProps,
  isDAOOwner,
  canUserVote,
  getVoteCounts,
  getProposalPhase,
  isVotingActive,
  isFeedbackActive,
  hasUserVoted,
} from "../utils/daoHelpers";
import { OnChainStatusBadge } from "../components/ui/OnChainStatusBadge";
import { ProposalChat } from "../components/features/dao/chat/ProposalChat";
import { VotesList } from "../components/features/dao/VotesList";

interface ProposalPageProps {
  proposalId: string;
  onBack: () => void;
}

export const ProposalPage: React.FC<ProposalPageProps> = ({
  proposalId,
  onBack,
}) => {
  const [proposal, setProposal] = useState<ProposalWithVotes | null>(null);
  const [dao, setDAO] = useState<DAO | null>(null);
  const [userMember, setUserMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const governanceContract = useGovernanceContract();

  // Memoize the governance contract functions to prevent re-renders
  const memoizedGovernanceContract = useMemo(
    () => ({
      voteYes: governanceContract.voteYes,
      voteNo: governanceContract.voteNo,
      voteAbstain: governanceContract.voteAbstain,
    }),
    [
      governanceContract.voteYes,
      governanceContract.voteNo,
      governanceContract.voteAbstain,
    ]
  );

  const isOwner =
    dao && address ? isDAOOwner(address, dao.owner_address) : false;
  const userHouse = userMember?.house;
  const proposalPhase = proposal ? getProposalPhase(proposal) : "ended";

  const [onChainStatus, setOnChainStatus] = useState<{
    voting?: "pending" | "success" | "failed" | "api-only";
    message?: string;
  }>({});

  useEffect(() => {
    const loadProposalDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const proposalResponse = await daoService.getProposalById(proposalId);
        if (!proposalResponse.success || !proposalResponse.data) {
          setError(proposalResponse.message || "Failed to load proposal");
          return;
        }

        setProposal(proposalResponse.data);

        // Load DAO details
        const daoData = await daoService.getDAOByIdDetailed(
          proposalResponse.data.dao_id
        );
        if (daoData) {
          setDAO(daoData);

          // Find user's membership
          if (address && daoData.members) {
            const member = daoData.members.find(
              (m) => m.member_id.toLowerCase() === address.toLowerCase()
            );
            setUserMember(member || null);
          }
        }

        // Auto-conclude proposal if needed
        try {
          const result = await daoService.autoConcludeProposals([
            proposalResponse.data,
          ]);
          if (result.total > 0) {
            console.log(
              `🔄 Auto-conclusion check for proposal ${proposalId.slice(
                0,
                8
              )}...`
            );

            const successfulConclusions = result.concluded.filter(
              (r) => r.success
            );
            if (successfulConclusions.length > 0) {
              console.log(
                `✅ Auto-concluded ${successfulConclusions.length} phases for proposal`
              );
              // Reload the proposal to get updated data
              const updatedProposal = await daoService.getProposalById(
                proposalId
              );
              if (updatedProposal.success && updatedProposal.data) {
                setProposal(updatedProposal.data);
              }
            }
          }
        } catch (conclusionError) {
          console.error("Error during auto-conclusion check:", conclusionError);
          // Don't fail the whole load if conclusion fails
        }
      } catch (error) {
        console.error("Error loading proposal details:", error);
        setError("Failed to load proposal details");
      } finally {
        setLoading(false);
      }
    };

    loadProposalDetails();
  }, [proposalId, address]);

  const handleVote = useCallback(
    async (vote: VoteType, isFeedback: boolean) => {
      if (!proposal || !address) return;

      setVoting(true);
      setOnChainStatus({ voting: "pending" });

      try {
        // Use hybrid voting that calls both API and on-chain contract
        console.log("🗳️ Casting hybrid vote...", proposal.dao_id);
        const response = await governanceService.castHybridVote(
          {
            proposal_id: proposalId,
            dao_id: proposal.dao_id,
            wallet_address: address,
            vote,
            is_feedback: isFeedback,
          },
          memoizedGovernanceContract
        );

        if (response.success) {
          // Update on-chain status based on response
          if (response.onChainVoted) {
            setOnChainStatus({ voting: "success" });
            console.log("✅ Vote recorded both in API and on-chain");
          } else if (response.onChainError) {
            setOnChainStatus({
              voting: "failed",
              message: response.onChainError,
            });
            console.warn(
              "⚠️ Vote recorded in API, but on-chain failed:",
              response.onChainError
            );
          } else {
            setOnChainStatus({ voting: "api-only" });
          }

          const updatedProposal = await daoService.getProposalById(proposalId);
          if (updatedProposal.success && updatedProposal.data) {
            setProposal(updatedProposal.data);
          }
        } else {
          setOnChainStatus({ voting: "failed", message: response.message });
          setError(response.message || "Failed to cast vote");
        }
      } catch (error) {
        console.error("Error casting vote:", error);
        setOnChainStatus({ voting: "failed", message: "Transaction failed" });
        setError("Failed to cast vote");
      } finally {
        setVoting(false);
        // Clear on-chain status after 5 seconds
        setTimeout(() => setOnChainStatus({}), 5000);
      }
    },
    [proposal, address, proposalId, memoizedGovernanceContract]
  );

  const renderVotingSection = useCallback(
    (isFeedback: boolean) => {
      if (!proposal) return null;

      const sectionTitle = isFeedback ? "Feedback Voting" : "Main Voting";
      const isActive = isFeedback
        ? isFeedbackActive(proposal)
        : isVotingActive(proposal);
      const voteCounts = getVoteCounts(proposal, isFeedback);
      const votePermission = canUserVote(
        proposal,
        address,
        userHouse,
        isOwner,
        isFeedback
      );

      const getVotePercentage = (weight: number) => {
        return voteCounts.total.weight > 0
          ? (weight / voteCounts.total.weight) * 100
          : 0;
      };

      return (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{sectionTitle}</CardTitle>
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Active" : "Closed"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Vote Results */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Yes</span>
                <span className="text-sm text-muted-foreground">
                  {voteCounts.yes.count} votes ({voteCounts.yes.weight} weight)
                </span>
              </div>
              <Progress
                value={getVotePercentage(voteCounts.yes.weight)}
                className="h-2"
              />

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">No</span>
                <span className="text-sm text-muted-foreground">
                  {voteCounts.no.count} votes ({voteCounts.no.weight} weight)
                </span>
              </div>
              <Progress
                value={getVotePercentage(voteCounts.no.weight)}
                className="h-2"
              />

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Abstain</span>
                <span className="text-sm text-muted-foreground">
                  {voteCounts.abstain.count} votes ({voteCounts.abstain.weight}{" "}
                  weight)
                </span>
              </div>
              <Progress
                value={getVotePercentage(voteCounts.abstain.weight)}
                className="h-2"
              />
            </div>

            {/* Detailed Vote Lists */}
            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Vote Details
              </h4>
              <VotesList
                proposalId={proposalId}
                isFeedback={isFeedback}
                house={!isFeedback ? proposal.voting_house : undefined}
                voteType="YES"
                count={voteCounts.yes.count}
                weight={voteCounts.yes.weight}
              />
              <VotesList
                proposalId={proposalId}
                isFeedback={isFeedback}
                house={!isFeedback ? proposal.voting_house : undefined}
                voteType="NO"
                count={voteCounts.no.count}
                weight={voteCounts.no.weight}
              />
              <VotesList
                proposalId={proposalId}
                isFeedback={isFeedback}
                house={!isFeedback ? proposal.voting_house : undefined}
                voteType="ABSTAIN"
                count={voteCounts.abstain.count}
                weight={voteCounts.abstain.weight}
              />
            </div>

            {/* Voting Buttons */}
            {votePermission.canVote ? (
              <div className="space-y-3">
                {/* On-chain status indicator */}
                {onChainStatus.voting && (
                  <div className="flex justify-center">
                    <OnChainStatusBadge
                      status={onChainStatus.voting}
                      message={onChainStatus.message}
                    />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleVote(VoteType.YES, isFeedback)}
                    disabled={voting}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {voting ? "Processing..." : "Vote Yes"}
                  </Button>
                  <Button
                    onClick={() => handleVote(VoteType.NO, isFeedback)}
                    disabled={voting}
                    variant="destructive"
                    className="flex-1"
                  >
                    {voting ? "Processing..." : "Vote No"}
                  </Button>
                  <Button
                    onClick={() => handleVote(VoteType.ABSTAIN, isFeedback)}
                    disabled={voting}
                    variant="outline"
                    className="flex-1"
                  >
                    {voting ? "Processing..." : "Abstain"}
                  </Button>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertDescription>{votePermission.reason}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      );
    },
    [
      proposal,
      address,
      userHouse,
      isOwner,
      proposalId,
      onChainStatus,
      voting,
      handleVote,
    ]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Proposal Not Found</h2>
        <p className="text-muted-foreground mb-6">
          {error || "The proposal you're looking for doesn't exist."}
        </p>
        <Button onClick={onBack}>← Back</Button>
      </div>
    );
  }

  const statusBadge = getProposalStatusBadgeProps(
    proposal.conclusion || "pending"
  );
  const houseBadge = getHouseBadgeProps(proposal.voting_house);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="outline" onClick={onBack} className="mb-4">
        ← Back
      </Button>

      {/* Proposal Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{proposal.title}</CardTitle>
              <CardDescription className="text-base mb-4">
                {proposal.description}
              </CardDescription>
              <div className="flex gap-2 mb-4">
                <Badge className={statusBadge.className}>
                  {statusBadge.text}
                </Badge>
                <Badge className={houseBadge.className}>
                  {houseBadge.text}
                </Badge>
                <Badge variant="outline">
                  Phase:{" "}
                  {proposalPhase.charAt(0).toUpperCase() +
                    proposalPhase.slice(1)}
                </Badge>
              </div>
              {/* IPFS Metadata Display */}
              {proposal.akave_url && (
                <IPFSMetadata akaveUrl={proposal.akave_url} compact />
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Proposal Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Voting Period</p>
              <p>{formatDateTime(proposal.voting_start)}</p>
              <p className="text-xs text-muted-foreground">to</p>
              <p>{formatDateTime(proposal.voting_end)}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">
                Feedback Period
              </p>
              <p>{formatDateTime(proposal.voting_end)}</p>
              <p className="text-xs text-muted-foreground">to</p>
              <p>{formatDateTime(proposal.feedback_end)}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Created</p>
              <p>{formatDateTime(proposal.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IPFS Metadata Section */}
      {proposal.akave_url && <IPFSMetadata akaveUrl={proposal.akave_url} />}

      {/* Main Voting Section */}
      {(proposalPhase === "voting" ||
        proposalPhase === "feedback" ||
        proposalPhase === "ended") &&
        renderVotingSection(false)}

      {/* Feedback Voting Section */}
      {(proposalPhase === "feedback" || proposalPhase === "ended") && (
        <>
          <Separator />
          {renderVotingSection(true)}
        </>
      )}

      {/* Final Results */}
      {proposalPhase === "ended" && (
        <Card>
          <CardHeader>
            <CardTitle>Final Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="font-medium">Voting Result</p>
                <p className="text-lg text-primary">{proposal.conclusion}</p>
              </div>
              <div>
                <p className="font-medium">Feedback Result</p>
                <p className="text-lg text-primary">
                  {proposal.feedback_conclusion}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DAO Information */}
      {dao && (
        <Card>
          <CardHeader>
            <CardTitle>DAO Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-2xl">🏛️</div>
              <div>
                <p className="font-medium">{dao.name}</p>
                <p className="text-sm text-muted-foreground">
                  {dao.description}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposal Chat */}
      <ProposalChat
        proposalId={proposalId}
        proposalTitle={proposal.title}
        isUserMember={!!userMember}
      />
    </div>
  );
};
