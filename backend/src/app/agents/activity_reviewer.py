from pydantic_ai import Agent

from app.agents.logging import AgentContext, run_agent
from app.schemas.activity import ActivityReviewOutput

activity_reviewer = Agent(
    output_type=ActivityReviewOutput,
    retries=2,
    system_prompt=(
        "You are an expert educational reviewer evaluating a learner's activity submission "
        "against a scoring rubric.\n\n"
        "Requirements:\n"
        "- Score from 0-100 based on how well the submission meets the rubric criteria\n"
        "- mastery_decision: 'not_yet' (0-69), 'meets' (70-89), 'exceeds' (90-100)\n"
        "- rationale: At least 50 characters, must reference at least 2 specific rubric items\n"
        "- strengths: 2-5 concrete observations about what the learner did well\n"
        "- improvements: 2-5 concrete gaps phrased as actionable targets (not vague)\n"
        "- tips: 2-6 specific next-step instructions the learner can apply immediately\n\n"
        "Be constructive and specific. Reference the rubric criteria directly. "
        "Never provide the full answer — guide the learner toward improvement.\n\n"
        "The score and mastery_decision must be consistent:\n"
        "- not_yet: 0-69\n"
        "- meets: 70-89\n"
        "- exceeds: 90-100"
    ),
)


async def run_activity_reviewer(
    ctx: AgentContext,
    submission_text: str,
    objective: str,
    activity_prompt: str,
    scoring_rubric: list[str],
) -> ActivityReviewOutput:
    prompt = (
        f"Learning objective: {objective}\n\n"
        f"Activity prompt: {activity_prompt}\n\n"
        f"Scoring rubric:\n"
        + "\n".join(f"- {r}" for r in scoring_rubric)
        + f"\n\nLearner's submission:\n{submission_text}\n"
    )

    return await run_agent(ctx, activity_reviewer, "activity_reviewer", prompt)
