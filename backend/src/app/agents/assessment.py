from pydantic_ai import Agent

from app.agents.logging import AgentContext, run_agent
from app.schemas.assessment import AssessmentSpecOutput, AssessmentReviewOutput

assessment_creator = Agent(
    output_type=AssessmentSpecOutput,
    retries=2,
    system_prompt=(
        "You are an expert assessment designer. Create a summative assessment that covers "
        "all learning objectives for a course.\n\n"
        "Requirements:\n"
        "- assessment_title: A clear title for this assessment\n"
        "- items: One item per objective (capped at 6 total). Each item has:\n"
        "  - objective: The learning objective being assessed\n"
        "  - prompt: A clear, specific prompt requiring the learner to demonstrate mastery. "
        "Require concrete evidence (explain, apply, produce, demonstrate).\n"
        "  - rubric: 3-6 specific, gradeable criteria\n\n"
        "If activity score data is provided, target weak areas more heavily — give them "
        "harder prompts or more specific rubric criteria.\n\n"
        "Keep it short. Prioritize evidence of mastery over comprehensiveness."
    ),
)

assessment_reviewer = Agent(
    output_type=AssessmentReviewOutput,
    retries=2,
    system_prompt=(
        "You are an expert assessment reviewer evaluating a learner's assessment submission.\n\n"
        "Requirements:\n"
        "- overall_score: 0-100, aggregated from per-objective scores\n"
        "- objective_scores: One entry per objective with score (0-100) and specific feedback\n"
        "- pass_decision: 'pass' if overall_score >= 70, 'fail' otherwise\n"
        "- next_steps: Actionable next steps. For any objective with score < 70, include at "
        "least one specific action targeting that weakness.\n\n"
        "Each objective feedback should:\n"
        "- Reference the rubric criteria for that item\n"
        "- Be 1-4 sentences covering what met the rubric, what didn't, and what to change\n"
        "- Be constructive and specific"
    ),
)


async def run_assessment_creator(
    ctx: AgentContext,
    objectives: list[str],
    course_description: str,
    activity_scores: list[dict] | None = None,
    learner_profile: dict | None = None,
) -> AssessmentSpecOutput:
    prompt = (
        f"Course description: {course_description}\n\n"
        f"Learning objectives:\n"
        + "\n".join(f"- {o}" for o in objectives)
    )
    if activity_scores:
        prompt += f"\n\nActivity performance data:\n{activity_scores}\n"
    if learner_profile:
        prompt += f"\nLearner profile: {learner_profile}\n"

    return await run_agent(ctx, assessment_creator, "assessment_creator", prompt)


async def run_assessment_reviewer(
    ctx: AgentContext,
    assessment_spec: dict,
    submissions: list[dict],
) -> AssessmentReviewOutput:
    prompt = (
        f"Assessment specification:\n{assessment_spec}\n\n"
        f"Learner's submissions:\n{submissions}\n"
    )

    return await run_agent(ctx, assessment_reviewer, "assessment_reviewer", prompt)
