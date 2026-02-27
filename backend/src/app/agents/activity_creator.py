from pydantic_ai import Agent

from app.agents.logging import AgentContext, run_agent
from app.schemas.activity import ActivitySpecOutput
from app.schemas.lesson import ActivitySeed

activity_creator = Agent(
    output_type=ActivitySpecOutput,
    retries=2,
    system_prompt=(
        "You are an expert activity designer for educational courses. Given an activity seed "
        "(type, prompt, expected evidence) and the lesson's mastery criteria, create a complete "
        "practice activity.\n\n"
        "Requirements:\n"
        "- instructions: Clear, actionable instructions (min 50 chars) telling the learner "
        "exactly what to do, including constraints (length, format, required components)\n"
        "- prompt: The specific question or task (min 20 chars)\n"
        "- scoring_rubric: 3-6 specific, gradeable criteria that map to the mastery criteria. "
        "Each should be checkable (e.g., 'Includes at least 3 examples with explanations')\n"
        "- hints: 2-5 scaffolding hints that guide without giving the answer\n\n"
        "The activity should directly test the learning objective. Make it challenging but "
        "achievable. Tailor to the learner's profile if provided."
    ),
)


async def run_activity_creator(
    ctx: AgentContext,
    activity_seed: ActivitySeed,
    objective: str,
    mastery_criteria: list[str],
    learner_profile: dict | None = None,
) -> ActivitySpecOutput:
    prompt = (
        f"Learning objective: {objective}\n\n"
        f"Mastery criteria:\n"
        + "\n".join(f"- {c}" for c in mastery_criteria)
        + f"\n\nActivity seed:\n{activity_seed.model_dump_json(indent=2)}\n"
    )
    if learner_profile:
        prompt += f"\nLearner profile: {learner_profile}\n"

    return await run_agent(ctx, activity_creator, "activity_creator", prompt)
