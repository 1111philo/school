---
title: "PRD 7 — Visual Aid System"
project: 1111 School
prd-number: 7
phase: Enhancement
depends-on:
  - PRD 6 (Learner Profile & Personalization)
agents:
  - visual_aid_sniffer (F)
  - visual_aid_creator (G)
status: draft
created: 2026-02-24
---

# PRD 7 — Visual Aid System

## 1. Overview

PRD 7 introduces two new agents — `visual_aid_sniffer` and `visual_aid_creator` — that analyze generated lessons for opportunities to add informative visual aids, then produce self-contained SVG, Mermaid, or PNG assets with meaningful alt text. The system integrates into the existing `pydantic_graph` course generation pipeline after the `lesson_writer` node, inserts placeholder tokens into lesson Markdown, and provides a frontend rendering pipeline that resolves those placeholders into accessible, inline visual content.

This PRD depends on PRD 6 because visual aid decisions and accessibility adaptations are grounded in the learner profile's UDL preferences and accessibility needs. Without a profile, the agents cannot make accessibility-aware layout decisions.

**Key principle**: Visual aids are **informative, not decorative**. Every generated graphic must materially improve comprehension of a concept that benefits from spatial, relational, or structural representation. If a lesson does not benefit from visuals, the sniffer returns "no" and no assets are generated.

---

## 2. Goals

1. **Enrich lessons with generated visual aids** — Automatically detect when a lesson would benefit from diagrams, flowcharts, tables, or other informative graphics, and generate them.
2. **Accessibility-first asset generation** — Prefer SVG and Mermaid formats for screen reader compatibility and scalability. Generate meaningful alt text for every asset.
3. **Learner-profile-aware visuals** — Adapt visual complexity, label density, and layout based on the learner's UDL preferences and accessibility needs from their profile.
4. **Seamless pipeline integration** — Visual aid nodes slot into the existing `pydantic_graph` course generation pipeline without disrupting the lesson-writing or activity-creation flow.
5. **Frontend rendering** — Render Mermaid diagrams via Mermaid.js, inline SVG directly, and display PNG with alt text, all through placeholder replacement in the Markdown rendering pipeline.

---

## 3. Non-Goals

- **Image generation via diffusion models** — No DALL-E, Stable Diffusion, or similar image generation. PNG assets are expected to be rare and limited to base64-encoded simple graphics the LLM can produce (e.g., pixel grids, simple charts). If the LLM cannot produce a valid PNG, the system falls back to Mermaid or SVG.
- **Interactive or animated visuals** — All assets are static. No JavaScript, no CSS animations, no interactive Mermaid features.
- **User editing of visual aids** — Users cannot modify generated visuals in v1. Regeneration is the only recourse.
- **External image hosting** — All assets are self-contained strings stored in the database. No CDN, no object storage for visual aids.
- **Decorative graphics** — No stock images, icons, or illustrations that do not convey informational content.

---

## 4. Scope

### 4.1 New Pydantic I/O Models

Two agent output models and supporting types for the visual aid pipeline.

### 4.2 Two New Agents

- **visual_aid_sniffer (F)** — Analyzes lesson content and decides whether informative graphics are needed
- **visual_aid_creator (G)** — Generates the actual asset content (SVG/Mermaid/PNG) with alt text

### 4.3 Pipeline Integration

- Two new `pydantic_graph` nodes inserted after `WriteLessonNode`
- Placeholder insertion into lesson body Markdown
- Database persistence of visual aid assets linked to lessons

### 4.4 Frontend Rendering

- Mermaid.js integration for mermaid assets
- Inline SVG rendering for svg assets
- Image tag rendering with alt text for png assets
- Placeholder replacement in the React Markdown rendering pipeline

### 4.5 API Extensions

- Endpoints for retrieving visual aids by lesson
- Visual aid data included in lesson response payloads

---

## 5. Technical Design

### 5.1 Agent Contracts — Full Pydantic Models

#### Supporting Types

```python
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class VisualNeed(str, Enum):
    """Whether visual aids are needed for a lesson."""
    YES = "yes"
    NO = "no"


class AssetType(str, Enum):
    """Supported visual aid asset formats."""
    SVG = "svg"
    PNG = "png"
    MERMAID = "mermaid"


class GraphicType(str, Enum):
    """Categories of informative graphics."""
    FLOWCHART = "flowchart"
    DIAGRAM = "diagram"
    TABLE = "table"
    COMPARISON = "comparison"
    TAXONOMY = "taxonomy"
    TIMELINE = "timeline"
    DECISION_TREE = "decision_tree"
    PROCESS = "process"
    HIERARCHY = "hierarchy"
    CONCEPT_MAP = "concept_map"
```

#### VisualAidSpec — Individual Visual Aid Specification

```python
class VisualAidSpec(BaseModel):
    """A single visual aid specification produced by the sniffer agent."""

    title: str = Field(
        ...,
        min_length=3,
        max_length=120,
        description="Concise title for the visual aid.",
    )
    description: str = Field(
        ...,
        min_length=20,
        max_length=800,
        description=(
            "Concrete description including: graphic type (flowchart, diagram, "
            "table, etc.), required labels/fields/nodes, and the learner "
            "takeaway the graphic supports. Must be specific enough for the "
            "creator agent to generate without guessing."
        ),
    )
    placement_hint: str = Field(
        ...,
        min_length=10,
        max_length=300,
        description=(
            "Where to insert the visual in the lesson body. Must reference an "
            "existing heading, section name, or unique phrase from the lesson. "
            'Example: "After the \'Step 2: Define Variables\' section".'
        ),
    )
    graphic_type: GraphicType = Field(
        ...,
        description="The category of informative graphic to generate.",
    )
    udl_rationale: str = Field(
        ...,
        min_length=10,
        max_length=300,
        description=(
            "How this visual aid connects to a UDL accommodation or learner "
            "profile signal. Must reference a specific signal, not a generic "
            "claim."
        ),
    )
```

#### VisualAidAssessment — Sniffer Agent Output (Agent F)

```python
class VisualAidAssessment(BaseModel):
    """Output of the visual_aid_sniffer agent.

    Determines whether a lesson needs visual aids and, if so, provides
    1-4 specifications for the visual_aid_creator to produce.
    """

    needs_visual_aids: VisualNeed = Field(
        ...,
        description='Whether the lesson needs informative visual aids: "yes" or "no".',
    )
    visual_aids: list[VisualAidSpec] = Field(
        default_factory=list,
        description=(
            "Specifications for visual aids to generate. Empty if "
            "needs_visual_aids is 'no'. 1-4 items if 'yes'."
        ),
    )

    @model_validator(mode="after")
    def validate_yes_no_coherence(self) -> VisualAidAssessment:
        """Enforce coherence between needs_visual_aids and visual_aids list.

        - If 'no': visual_aids must be empty.
        - If 'yes': visual_aids must contain 1-4 items.
        """
        if self.needs_visual_aids == VisualNeed.NO:
            if len(self.visual_aids) != 0:
                raise ValueError(
                    "needs_visual_aids is 'no' but visual_aids is not empty. "
                    "Set visual_aids to [] when no visuals are needed."
                )
        else:
            if not (1 <= len(self.visual_aids) <= 4):
                raise ValueError(
                    f"needs_visual_aids is 'yes' but visual_aids has "
                    f"{len(self.visual_aids)} items. Must be 1-4."
                )
        return self

    @model_validator(mode="after")
    def validate_no_duplicate_purposes(self) -> VisualAidAssessment:
        """Each visual aid must have a distinct title and placement."""
        if len(self.visual_aids) <= 1:
            return self
        titles = [aid.title.lower().strip() for aid in self.visual_aids]
        if len(titles) != len(set(titles)):
            raise ValueError(
                "Visual aid titles must be unique. Each aid must serve a "
                "distinct purpose."
            )
        return self
```

#### VisualAidAsset — Creator Agent Output (Agent G)

```python
class VisualAidAsset(BaseModel):
    """Output of the visual_aid_creator agent.

    Contains the generated visual asset content and accessibility metadata.
    One VisualAidAsset is produced per VisualAidSpec.
    """

    asset_type: AssetType = Field(
        ...,
        description=(
            "Format of the generated asset. Prefer 'mermaid' or 'svg' for "
            "accessibility. Use 'png' only when raster is strictly required."
        ),
    )
    asset: str = Field(
        ...,
        min_length=10,
        description=(
            "The asset content. For 'mermaid': valid Mermaid diagram syntax. "
            "For 'svg': valid SVG XML string. For 'png': base64-encoded PNG data."
        ),
    )
    alt_text: str = Field(
        ...,
        min_length=15,
        max_length=500,
        description=(
            "Meaningful alt text describing the information conveyed by the "
            "visual, not its appearance. 1-3 sentences. Must not start with "
            "'image of' or 'picture of'. Includes key structure and takeaway."
        ),
    )
    title: str = Field(
        ...,
        min_length=3,
        max_length=120,
        description="Title matching the VisualAidSpec this asset fulfills.",
    )

    @field_validator("alt_text")
    @classmethod
    def validate_alt_text_not_decorative(cls, v: str) -> str:
        """Alt text must describe information, not appearance."""
        lower = v.lower().strip()
        forbidden_prefixes = ["image of", "picture of", "photo of", "icon of"]
        for prefix in forbidden_prefixes:
            if lower.startswith(prefix):
                raise ValueError(
                    f"Alt text must not start with '{prefix}'. Describe the "
                    f"information conveyed, not the visual appearance."
                )
        # Must be 1-3 sentences
        sentences = [s.strip() for s in v.split(".") if s.strip()]
        if not (1 <= len(sentences) <= 3):
            raise ValueError(
                f"Alt text must be 1-3 sentences. Found {len(sentences)}."
            )
        return v

    @field_validator("asset")
    @classmethod
    def validate_no_external_dependencies(cls, v: str) -> str:
        """Asset must be self-contained with no external references."""
        external_patterns = [
            r'href\s*=\s*["\']https?://',
            r'src\s*=\s*["\']https?://',
            r'url\s*\(\s*["\']?https?://',
            r'xlink:href\s*=\s*["\']https?://',
        ]
        for pattern in external_patterns:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError(
                    "Asset must be self-contained with no external URLs. "
                    "Remove all external href, src, url(), and xlink:href "
                    "references."
                )
        return v

    @model_validator(mode="after")
    def validate_asset_format(self) -> VisualAidAsset:
        """Validate that the asset content matches its declared type."""
        if self.asset_type == AssetType.MERMAID:
            self._validate_mermaid_syntax()
        elif self.asset_type == AssetType.SVG:
            self._validate_svg_xml()
        elif self.asset_type == AssetType.PNG:
            self._validate_png_base64()
        return self

    def _validate_mermaid_syntax(self) -> None:
        """Basic validation that asset looks like valid Mermaid syntax."""
        stripped = self.asset.strip()
        valid_starts = [
            "graph ", "graph\n",
            "flowchart ", "flowchart\n",
            "sequenceDiagram", "classDiagram", "stateDiagram",
            "erDiagram", "gantt", "pie", "gitgraph",
            "mindmap", "timeline", "quadrantChart",
            "xychart", "block-beta",
        ]
        if not any(stripped.startswith(start) for start in valid_starts):
            raise ValueError(
                f"Mermaid asset must start with a valid diagram type "
                f"declaration (e.g., 'flowchart TD', 'sequenceDiagram', "
                f"'classDiagram'). Got: '{stripped[:40]}...'"
            )
        # Check for balanced brackets (basic structural check)
        if stripped.count("[") != stripped.count("]"):
            raise ValueError(
                "Mermaid asset has unbalanced square brackets. "
                "Ensure all [ have matching ]."
            )
        if stripped.count("{") != stripped.count("}"):
            raise ValueError(
                "Mermaid asset has unbalanced curly brackets. "
                "Ensure all { have matching }."
            )
        # Reject script injection
        if "<script" in stripped.lower():
            raise ValueError("Mermaid asset must not contain <script> tags.")

    def _validate_svg_xml(self) -> None:
        """Validate that asset is well-formed SVG XML."""
        stripped = self.asset.strip()
        if not stripped.startswith("<"):
            raise ValueError("SVG asset must start with '<'.")
        try:
            root = ET.fromstring(stripped)
        except ET.ParseError as e:
            raise ValueError(
                f"SVG asset is not valid XML: {e}. Ensure the SVG is "
                f"well-formed with properly closed tags."
            ) from e
        # Verify root is an SVG element
        tag = root.tag
        if not (tag == "svg" or tag.endswith("}svg")):
            raise ValueError(
                f"SVG asset root element must be <svg>, got <{tag}>."
            )
        # Reject script elements
        for elem in root.iter():
            local_tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if local_tag == "script":
                raise ValueError(
                    "SVG asset must not contain <script> elements."
                )

    def _validate_png_base64(self) -> None:
        """Validate that asset is valid base64-encoded PNG data."""
        import base64

        stripped = self.asset.strip()
        # Remove data URI prefix if present
        if stripped.startswith("data:image/png;base64,"):
            stripped = stripped[len("data:image/png;base64,"):]
        try:
            decoded = base64.b64decode(stripped, validate=True)
        except Exception as e:
            raise ValueError(
                f"PNG asset is not valid base64: {e}."
            ) from e
        # Check PNG magic bytes
        if not decoded.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(
                "PNG asset does not have valid PNG header bytes."
            )
```

#### Sniffer Agent Input Context

```python
class VisualAidSnifferInput(BaseModel):
    """Input context for the visual_aid_sniffer agent."""

    lesson_body: str = Field(
        ...,
        description="The full Markdown lesson body from lesson_writer output.",
    )
    lesson_title: str = Field(
        ...,
        description="Title of the lesson being analyzed.",
    )
    udl_accommodations: UDLAccommodations = Field(
        ...,
        description="UDL accommodations from the lesson plan.",
    )
    learner_profile_signals: LearnerProfileSignals = Field(
        ...,
        description=(
            "Relevant learner profile signals for visual aid decisions. "
            "Extracted from the full LearnerProfile."
        ),
    )


class UDLAccommodations(BaseModel):
    """UDL accommodations from the lesson plan (PRD 2 LessonPlanOutput)."""

    engagement: list[str] = Field(default_factory=list)
    representation: list[str] = Field(default_factory=list)
    action_expression: list[str] = Field(default_factory=list)


class LearnerProfileSignals(BaseModel):
    """Subset of learner profile relevant to visual aid decisions."""

    experience_level: str = Field(
        ...,
        description="e.g., 'beginner', 'intermediate', 'advanced'",
    )
    preferred_learning_style: str | None = Field(
        default=None,
        description="e.g., 'visual', 'reading', 'kinesthetic'",
    )
    accessibility_needs: list[str] = Field(
        default_factory=list,
        description=(
            "Specific accessibility needs from the profile, e.g., "
            "'low vision', 'dyslexia', 'cognitive load reduction'."
        ),
    )
    udl_representation_preferences: list[str] = Field(
        default_factory=list,
        description="UDL Representation preferences from the learner profile.",
    )
```

#### Creator Agent Input Context

```python
class VisualAidCreatorInput(BaseModel):
    """Input context for the visual_aid_creator agent."""

    spec: VisualAidSpec = Field(
        ...,
        description="The visual aid specification from the sniffer.",
    )
    lesson_context: str = Field(
        ...,
        description=(
            "Relevant section of the lesson body around the placement hint. "
            "Provides context for generating an accurate visual."
        ),
    )
    accessibility_needs: list[str] = Field(
        default_factory=list,
        description=(
            "Learner accessibility needs that should influence layout: "
            "simplified structure, clear labels, larger text, reduced clutter."
        ),
    )
```

### 5.2 Agent Implementations

#### visual_aid_sniffer (Agent F)

```python
from pydantic_ai import Agent, ModelRetry, RunContext

from app.agents.deps import PipelineDeps
from app.models.visual_aids import (
    VisualAidAssessment,
    VisualAidSnifferInput,
    VisualNeed,
)

visual_aid_sniffer = Agent(
    "openai:gpt-4o",
    output_type=VisualAidAssessment,
    deps_type=PipelineDeps,
    output_retries=2,
    instructions=(
        "You are a visual aid analyst for an educational platform. Your job "
        "is to determine whether a lesson would benefit from informative "
        "graphics — diagrams, flowcharts, tables, concept maps, timelines, "
        "or other visual representations that materially improve comprehension."
        "\n\n"
        "RULES:\n"
        "- Only suggest visuals for concepts that benefit from spatial, "
        "relational, or structural representation.\n"
        "- Never suggest decorative or aesthetic images.\n"
        "- Each visual must have a distinct purpose — no duplication.\n"
        "- Placement hints must reference an actual heading or phrase from "
        "the lesson.\n"
        "- Ground your decisions in the learner's UDL accommodations and "
        "profile signals.\n"
        "- If the lesson is primarily textual explanation without process, "
        "comparison, or structural content, return needs_visual_aids='no'.\n"
        "- Maximum 4 visual aids per lesson."
    ),
)


@visual_aid_sniffer.instructions
async def inject_learner_context(ctx: RunContext[PipelineDeps]) -> str:
    """Inject learner profile and UDL context into the system prompt."""
    profile = ctx.deps.learner_profile_signals
    if not profile:
        return ""
    parts = [f"Learner experience level: {profile.experience_level}"]
    if profile.preferred_learning_style:
        parts.append(
            f"Preferred learning style: {profile.preferred_learning_style}"
        )
    if profile.accessibility_needs:
        parts.append(
            f"Accessibility needs: {', '.join(profile.accessibility_needs)}"
        )
    if profile.udl_representation_preferences:
        parts.append(
            "UDL representation preferences: "
            f"{', '.join(profile.udl_representation_preferences)}"
        )
    return "\n\nLEARNER CONTEXT:\n" + "\n".join(parts)


@visual_aid_sniffer.output_validator
async def validate_placement_hints(
    ctx: RunContext[PipelineDeps], output: VisualAidAssessment
) -> VisualAidAssessment:
    """Validate that placement hints reference content in the lesson."""
    if output.needs_visual_aids == VisualNeed.NO:
        return output

    lesson_body = ctx.deps.current_lesson_body
    if not lesson_body:
        return output

    lesson_lower = lesson_body.lower()

    for aid in output.visual_aids:
        # Extract key phrases from placement hint to search for in lesson
        # Look for quoted section names or heading references
        hint_lower = aid.placement_hint.lower()

        # Check if any heading from the lesson is referenced
        headings = [
            line.lstrip("#").strip().lower()
            for line in lesson_body.split("\n")
            if line.strip().startswith("#")
        ]

        hint_references_heading = any(
            heading in hint_lower or hint_lower in heading
            for heading in headings
            if len(heading) > 3
        )

        # Also check for quoted phrases
        quoted_phrases = re.findall(r"['\"]([^'\"]+)['\"]", aid.placement_hint)
        hint_references_quote = any(
            phrase.lower() in lesson_lower for phrase in quoted_phrases
        )

        if not hint_references_heading and not hint_references_quote:
            raise ModelRetry(
                f"Placement hint for '{aid.title}' does not reference a "
                f"recognizable heading or quoted phrase from the lesson. "
                f"Available headings: {headings[:8]}. "
                f"Rewrite the placement hint to reference an existing section."
            )

    return output
```

#### visual_aid_creator (Agent G)

```python
visual_aid_creator = Agent(
    "openai:gpt-4o",
    output_type=VisualAidAsset,
    deps_type=PipelineDeps,
    output_retries=2,
    instructions=(
        "You are a visual aid creator for an educational platform. Given a "
        "specification for an informative graphic, you generate the actual "
        "asset content as SVG, Mermaid diagram syntax, or (rarely) PNG.\n\n"
        "FORMAT PREFERENCE ORDER:\n"
        "1. Mermaid — Best for flowcharts, sequence diagrams, state diagrams, "
        "class diagrams, ER diagrams, Gantt charts, pie charts, mind maps. "
        "Use when the concept maps naturally to a Mermaid diagram type.\n"
        "2. SVG — Best for custom diagrams, labeled illustrations, comparison "
        "tables, concept maps that don't fit Mermaid. Use clean, semantic SVG "
        "with text elements for labels.\n"
        "3. PNG — Last resort only. Use only when raster format is strictly "
        "required and the other formats cannot represent the content.\n\n"
        "RULES:\n"
        "- Assets must be completely self-contained. No external URLs, images, "
        "fonts, or scripts.\n"
        "- Mermaid syntax must be valid and renderable without edits.\n"
        "- SVG must be valid XML with an <svg> root element.\n"
        "- Use clear, readable labels. Avoid tiny text.\n"
        "- Structure and spacing should reduce cognitive load.\n"
        "- Alt text must describe the information conveyed (relationships, "
        "flow, comparisons), not the visual appearance.\n"
        "- Alt text must be 1-3 sentences and must not start with 'image of' "
        "or similar.\n"
        "- Match the title from the specification exactly."
    ),
)


@visual_aid_creator.instructions
async def inject_accessibility_context(ctx: RunContext[PipelineDeps]) -> str:
    """Inject accessibility needs into the system prompt."""
    needs = ctx.deps.accessibility_needs
    if not needs:
        return ""
    return (
        "\n\nACCESSIBILITY REQUIREMENTS:\n"
        f"This learner has the following accessibility needs: "
        f"{', '.join(needs)}.\n"
        "Adapt your output accordingly:\n"
        "- Simplified layout with minimal visual clutter\n"
        "- Clear, large labels with high contrast\n"
        "- Generous spacing between elements\n"
        "- Logical reading order in SVG (top-to-bottom, left-to-right)\n"
        "- Avoid relying solely on color to convey meaning"
    )


@visual_aid_creator.output_validator
async def validate_asset_content(
    ctx: RunContext[PipelineDeps], output: VisualAidAsset
) -> VisualAidAsset:
    """Additional business-rule validation beyond Pydantic schema checks."""
    # Verify title matches the spec title
    spec_title = ctx.deps.current_visual_spec_title
    if spec_title and output.title.strip().lower() != spec_title.strip().lower():
        raise ModelRetry(
            f"Title must match the specification title '{spec_title}'. "
            f"Got '{output.title}'."
        )

    # For Mermaid: verify minimum structural complexity
    if output.asset_type == AssetType.MERMAID:
        lines = [
            line.strip()
            for line in output.asset.strip().split("\n")
            if line.strip() and not line.strip().startswith("%%")
        ]
        if len(lines) < 3:
            raise ModelRetry(
                "Mermaid diagram is too simple. Must have at least 3 "
                "non-comment lines including the diagram type declaration "
                "and at least 2 content lines."
            )

    # For SVG: verify it contains meaningful content (not an empty SVG)
    if output.asset_type == AssetType.SVG:
        if "<text" not in output.asset and "<path" not in output.asset:
            raise ModelRetry(
                "SVG asset appears to have no visible content. Must contain "
                "at least <text> or <path> elements."
            )

    return output
```

### 5.3 Pipeline Integration

#### Graph State Extension

The existing `CourseGenerationState` (from PRD 2) is extended with visual aid tracking:

```python
from dataclasses import dataclass, field

from app.models.visual_aids import VisualAidAssessment, VisualAidAsset


@dataclass
class CourseGenerationState:
    """Shared state across the course generation pipeline.

    Extended from PRD 2 with visual aid fields.
    """

    # --- Existing fields from PRD 2/3 ---
    course_description: str = ""
    objectives: list[str] = field(default_factory=list)
    current_objective_index: int = 0
    lesson_plan: dict | None = None
    lesson_content: dict | None = None
    # ... other existing fields ...

    # --- PRD 7 additions ---
    visual_aid_assessment: VisualAidAssessment | None = None
    visual_aid_assets: list[VisualAidAsset] = field(default_factory=list)
    visual_aid_db_ids: list[str] = field(default_factory=list)
```

#### New Graph Nodes

```python
from dataclasses import dataclass

from pydantic_graph import BaseNode, End, GraphRunContext

from app.agents.visual_aid_creator import visual_aid_creator
from app.agents.visual_aid_sniffer import visual_aid_sniffer
from app.models.visual_aids import (
    VisualAidAsset,
    VisualAidCreatorInput,
    VisualAidSnifferInput,
    VisualNeed,
)
from app.pipeline.state import CourseGenerationState


@dataclass
class SniffVisualAidsNode(BaseNode[CourseGenerationState]):
    """Run visual_aid_sniffer to determine if the lesson needs visual aids.

    Inserted after WriteLessonNode in the pipeline.
    """

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> CreateVisualAidsNode | CreateActivityNode:
        """Analyze the lesson and decide whether to generate visuals."""
        state = ctx.state

        sniffer_input = VisualAidSnifferInput(
            lesson_body=state.lesson_content["lessonBody"],
            lesson_title=state.lesson_content["lessonTitle"],
            udl_accommodations=state.lesson_plan["udlAccommodations"],
            learner_profile_signals=state.learner_profile_signals,
        )

        # Inject lesson body into deps for output validator access
        deps = state.pipeline_deps
        deps.current_lesson_body = sniffer_input.lesson_body

        result = await visual_aid_sniffer.run(
            f"Analyze this lesson and determine if informative visual aids "
            f"are needed.\n\n"
            f"LESSON TITLE: {sniffer_input.lesson_title}\n\n"
            f"LESSON BODY:\n{sniffer_input.lesson_body}\n\n"
            f"UDL ACCOMMODATIONS:\n"
            f"- Engagement: {sniffer_input.udl_accommodations.engagement}\n"
            f"- Representation: {sniffer_input.udl_accommodations.representation}\n"
            f"- Action/Expression: {sniffer_input.udl_accommodations.action_expression}",
            deps=deps,
        )

        state.visual_aid_assessment = result.output

        # Log the agent run
        await state.log_agent_run(
            agent_name="visual_aid_sniffer",
            result=result,
        )

        if result.output.needs_visual_aids == VisualNeed.YES:
            return CreateVisualAidsNode()
        else:
            return CreateActivityNode()


@dataclass
class CreateVisualAidsNode(BaseNode[CourseGenerationState]):
    """Run visual_aid_creator for each visual aid spec from the sniffer.

    Generates assets, inserts placeholders into the lesson body, and
    persists VisualAid records to the database.
    """

    async def run(
        self, ctx: GraphRunContext[CourseGenerationState]
    ) -> CreateActivityNode:
        """Generate visual assets and insert placeholders."""
        state = ctx.state
        assessment = state.visual_aid_assessment

        if not assessment or assessment.needs_visual_aids == VisualNeed.NO:
            return CreateActivityNode()

        state.visual_aid_assets = []
        state.visual_aid_db_ids = []
        lesson_body = state.lesson_content["lessonBody"]

        for i, spec in enumerate(assessment.visual_aids):
            # Extract surrounding context for the creator
            lesson_context = self._extract_context_around_placement(
                lesson_body, spec.placement_hint
            )

            deps = state.pipeline_deps
            deps.current_visual_spec_title = spec.title
            deps.accessibility_needs = (
                state.learner_profile_signals.accessibility_needs
                if state.learner_profile_signals
                else []
            )

            result = await visual_aid_creator.run(
                f"Generate a visual aid based on this specification.\n\n"
                f"TITLE: {spec.title}\n"
                f"GRAPHIC TYPE: {spec.graphic_type.value}\n"
                f"DESCRIPTION: {spec.description}\n\n"
                f"LESSON CONTEXT (around placement point):\n{lesson_context}",
                deps=deps,
            )

            asset = result.output
            state.visual_aid_assets.append(asset)

            # Persist to database
            visual_aid_id = await state.persist_visual_aid(
                lesson_id=state.current_lesson_id,
                spec=spec,
                asset=asset,
            )
            state.visual_aid_db_ids.append(visual_aid_id)

            # Insert placeholder into lesson body
            placeholder = f"{{{{VISUAL_AID:{visual_aid_id}}}}}"
            lesson_body = self._insert_placeholder(
                lesson_body, spec.placement_hint, placeholder
            )

            # Log the agent run
            await state.log_agent_run(
                agent_name="visual_aid_creator",
                result=result,
                metadata={"visual_aid_id": visual_aid_id, "spec_index": i},
            )

        # Update lesson body with placeholders
        state.lesson_content["lessonBody"] = lesson_body
        await state.update_lesson_body(
            lesson_id=state.current_lesson_id,
            body=lesson_body,
        )

        return CreateActivityNode()

    @staticmethod
    def _extract_context_around_placement(
        lesson_body: str, placement_hint: str, context_lines: int = 10
    ) -> str:
        """Extract lesson text around the placement hint location.

        Searches for headings or quoted phrases from the hint and returns
        surrounding lines for context.
        """
        lines = lesson_body.split("\n")
        hint_lower = placement_hint.lower()

        # Find the best matching line
        best_idx = 0
        best_score = 0

        for idx, line in enumerate(lines):
            line_lower = line.lower().strip()
            # Check heading matches
            if line.strip().startswith("#"):
                heading = line.lstrip("#").strip().lower()
                if heading in hint_lower or hint_lower in heading:
                    best_idx = idx
                    best_score = len(heading)

            # Check quoted phrase matches
            quoted = re.findall(r"['\"]([^'\"]+)['\"]", placement_hint)
            for phrase in quoted:
                if phrase.lower() in line_lower:
                    score = len(phrase)
                    if score > best_score:
                        best_idx = idx
                        best_score = score

        start = max(0, best_idx - context_lines // 2)
        end = min(len(lines), best_idx + context_lines // 2 + 1)
        return "\n".join(lines[start:end])

    @staticmethod
    def _insert_placeholder(
        lesson_body: str, placement_hint: str, placeholder: str
    ) -> str:
        """Insert a visual aid placeholder after the referenced section.

        Finds the heading or phrase referenced by the placement hint and
        inserts the placeholder after that section (before the next heading
        or at end of content).
        """
        lines = lesson_body.split("\n")
        hint_lower = placement_hint.lower()
        insert_after = len(lines) - 1  # Default: end of document

        # Find the referenced heading/phrase
        for idx, line in enumerate(lines):
            line_lower = line.lower().strip()
            if line.strip().startswith("#"):
                heading = line.lstrip("#").strip().lower()
                if heading in hint_lower or any(
                    phrase.lower() in heading
                    for phrase in re.findall(
                        r"['\"]([^'\"]+)['\"]", placement_hint
                    )
                ):
                    # Find end of this section (next heading or EOF)
                    for j in range(idx + 1, len(lines)):
                        if lines[j].strip().startswith("#"):
                            insert_after = j - 1
                            break
                    else:
                        insert_after = len(lines) - 1
                    break

        # Insert placeholder with blank lines for Markdown spacing
        lines.insert(insert_after + 1, f"\n{placeholder}\n")
        return "\n".join(lines)
```

#### Updated Pipeline Graph

```python
from pydantic_graph import Graph

from app.pipeline.nodes import (
    CreateActivityNode,
    CreateVisualAidsNode,
    DescribeCourseNode,
    PlanLessonNode,
    SniffVisualAidsNode,
    WriteLessonNode,
)

# Updated graph with visual aid nodes
course_generation_graph = Graph(
    nodes=[
        DescribeCourseNode,
        PlanLessonNode,
        WriteLessonNode,
        SniffVisualAidsNode,    # NEW: PRD 7
        CreateVisualAidsNode,   # NEW: PRD 7
        CreateActivityNode,
    ]
)

# Node flow per objective:
# DescribeCourse -> PlanLesson -> WriteLesson -> SniffVisualAids
#   -> (if yes) CreateVisualAids -> CreateActivity
#   -> (if no)  CreateActivity
```

### 5.4 Database Schema

#### VisualAid Table

```python
from sqlalchemy import Column, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base, TimestampMixin


class VisualAid(Base, TimestampMixin):
    """Stores generated visual aid assets linked to lessons.

    Each row represents one visual aid (one VisualAidSpec -> one VisualAidAsset).
    """

    __tablename__ = "visual_aids"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    lesson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # From VisualAidSpec (sniffer output)
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=False)
    placement_hint = Column(String(300), nullable=False)
    graphic_type = Column(String(30), nullable=False)
    udl_rationale = Column(String(300), nullable=False)

    # From VisualAidAsset (creator output)
    asset_type = Column(
        Enum("svg", "png", "mermaid", name="asset_type_enum"),
        nullable=False,
    )
    asset = Column(Text, nullable=False)
    alt_text = Column(String(500), nullable=False)

    # Relationships
    lesson = relationship("Lesson", back_populates="visual_aids")
```

#### Lesson Model Update

```python
# In the existing Lesson model (PRD 1), add the relationship:

class Lesson(Base, TimestampMixin):
    # ... existing fields ...

    # PRD 7 addition
    visual_aids = relationship(
        "VisualAid",
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="VisualAid.created_at",
    )
```

#### Alembic Migration

```python
"""add visual_aids table

Revision ID: prd7_001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.create_table(
        "visual_aids",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lesson_id", UUID(as_uuid=True), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("placement_hint", sa.String(300), nullable=False),
        sa.Column("graphic_type", sa.String(30), nullable=False),
        sa.Column("udl_rationale", sa.String(300), nullable=False),
        sa.Column("asset_type", sa.Enum("svg", "png", "mermaid", name="asset_type_enum"), nullable=False),
        sa.Column("asset", sa.Text, nullable=False),
        sa.Column("alt_text", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("visual_aids")
    op.execute("DROP TYPE IF EXISTS asset_type_enum")
```

### 5.5 Frontend Rendering

#### Placeholder Replacement in Markdown Pipeline

The lesson viewer already uses `react-markdown` (PRD 5). PRD 7 extends the rendering pipeline to detect `{{VISUAL_AID:<id>}}` placeholders and replace them with rendered components.

```typescript
// src/components/lesson/VisualAidRenderer.tsx

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Initialize Mermaid.js with accessible defaults
mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "strict",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
});

// --- Types ---

interface VisualAidData {
  id: string;
  assetType: "svg" | "png" | "mermaid";
  asset: string;
  altText: string;
  title: string;
}

interface VisualAidRendererProps {
  visualAid: VisualAidData;
}

// --- Mermaid Renderer ---

function MermaidRenderer({ visualAid }: VisualAidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;
      try {
        const id = `mermaid-${visualAid.id}`;
        const { svg } = await mermaid.render(id, visualAid.asset);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (err) {
        setError(
          `Failed to render Mermaid diagram: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    };
    renderDiagram();
  }, [visualAid.asset, visualAid.id]);

  if (error) {
    return (
      <div role="img" aria-label={visualAid.altText} className="visual-aid-error">
        <p className="text-red-500 text-sm">{error}</p>
        <details>
          <summary>Diagram source</summary>
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
            {visualAid.asset}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <figure className="visual-aid visual-aid--mermaid my-6">
      <div
        ref={containerRef}
        role="img"
        aria-label={visualAid.altText}
        className="flex justify-center"
      />
      {rendered && (
        <figcaption className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
          {visualAid.title}
        </figcaption>
      )}
    </figure>
  );
}

// --- SVG Renderer ---

function SvgRenderer({ visualAid }: VisualAidRendererProps) {
  return (
    <figure className="visual-aid visual-aid--svg my-6">
      <div
        role="img"
        aria-label={visualAid.altText}
        className="flex justify-center"
        dangerouslySetInnerHTML={{ __html: visualAid.asset }}
      />
      <figcaption className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
        {visualAid.title}
      </figcaption>
    </figure>
  );
}

// --- PNG Renderer ---

function PngRenderer({ visualAid }: VisualAidRendererProps) {
  const src = visualAid.asset.startsWith("data:")
    ? visualAid.asset
    : `data:image/png;base64,${visualAid.asset}`;

  return (
    <figure className="visual-aid visual-aid--png my-6">
      <img
        src={src}
        alt={visualAid.altText}
        className="max-w-full h-auto mx-auto"
        loading="lazy"
      />
      <figcaption className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
        {visualAid.title}
      </figcaption>
    </figure>
  );
}

// --- Main Renderer (dispatches by asset type) ---

export function VisualAidRenderer({ visualAid }: VisualAidRendererProps) {
  switch (visualAid.assetType) {
    case "mermaid":
      return <MermaidRenderer visualAid={visualAid} />;
    case "svg":
      return <SvgRenderer visualAid={visualAid} />;
    case "png":
      return <PngRenderer visualAid={visualAid} />;
    default:
      return null;
  }
}
```

#### Markdown Placeholder Integration

```typescript
// src/components/lesson/LessonContent.tsx

import ReactMarkdown from "react-markdown";
import { VisualAidRenderer } from "./VisualAidRenderer";
import type { VisualAidData } from "./VisualAidRenderer";

interface LessonContentProps {
  markdown: string;
  visualAids: VisualAidData[];
}

/**
 * Regex to match visual aid placeholders in lesson Markdown.
 * Pattern: {{VISUAL_AID:<uuid>}}
 */
const VISUAL_AID_PLACEHOLDER = /\{\{VISUAL_AID:([a-f0-9-]+)\}\}/g;

/**
 * Split Markdown content at visual aid placeholders and interleave
 * rendered visual aid components.
 */
export function LessonContent({ markdown, visualAids }: LessonContentProps) {
  const visualAidMap = new Map(visualAids.map((va) => [va.id, va]));

  // Split content into segments: text and visual aid placeholders
  const segments: Array<{ type: "markdown"; content: string } | { type: "visual_aid"; id: string }> = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(VISUAL_AID_PLACEHOLDER)) {
    const [fullMatch, id] = match;
    const matchIndex = match.index!;

    // Text before this placeholder
    if (matchIndex > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, matchIndex),
      });
    }

    segments.push({ type: "visual_aid", id });
    lastIndex = matchIndex + fullMatch.length;
  }

  // Remaining text after last placeholder
  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
    });
  }

  return (
    <div className="lesson-content prose dark:prose-invert max-w-none">
      {segments.map((segment, idx) => {
        if (segment.type === "markdown") {
          return <ReactMarkdown key={idx}>{segment.content}</ReactMarkdown>;
        }
        const visualAid = visualAidMap.get(segment.id);
        if (!visualAid) {
          return null; // Placeholder with no matching data — skip silently
        }
        return <VisualAidRenderer key={segment.id} visualAid={visualAid} />;
      })}
    </div>
  );
}
```

#### Mermaid.js Dependency

```bash
# Add to frontend project
npm install mermaid@^11
```

---

## 6. API Endpoints

### 6.1 Visual Aids by Lesson

```
GET /api/lessons/{lesson_id}/visual-aids
```

**Response** `200 OK`:
```json
[
  {
    "id": "uuid",
    "lessonId": "uuid",
    "title": "Data Flow Through the Pipeline",
    "assetType": "mermaid",
    "asset": "flowchart TD\n  A[Input] --> B[Process]\n  B --> C[Output]",
    "altText": "A flowchart showing data flowing from Input through Process to Output, illustrating the three-stage pipeline architecture.",
    "graphicType": "flowchart",
    "placementHint": "After the 'Pipeline Architecture' section",
    "createdAt": "2026-02-24T12:00:00Z"
  }
]
```

### 6.2 Lesson Response Extension

The existing `GET /api/lessons/{lesson_id}` response is extended to include visual aids inline:

```
GET /api/lessons/{lesson_id}
```

**Response** `200 OK` (extended):
```json
{
  "id": "uuid",
  "courseInstanceId": "uuid",
  "lessonTitle": "Understanding Data Pipelines",
  "lessonBody": "# Introduction\n\nData pipelines are...\n\n{{VISUAL_AID:uuid-1}}\n\n## Processing Stage\n...",
  "keyTakeaways": ["..."],
  "status": "unlocked",
  "visualAids": [
    {
      "id": "uuid-1",
      "assetType": "mermaid",
      "asset": "flowchart TD\n  A[Input] --> B[Process]\n  B --> C[Output]",
      "altText": "A flowchart showing data flowing from Input through Process to Output.",
      "title": "Data Flow Through the Pipeline"
    }
  ]
}
```

### 6.3 Regenerate Visual Aids

```
POST /api/lessons/{lesson_id}/visual-aids/regenerate
```

Triggers a re-run of the `visual_aid_sniffer` and `visual_aid_creator` pipeline for a specific lesson. Deletes existing visual aids and placeholders, then regenerates.

**Response** `200 OK`:
```json
{
  "regenerated": true,
  "visualAidCount": 2,
  "visualAids": [...]
}
```

**Response** `200 OK` (no visuals needed):
```json
{
  "regenerated": true,
  "visualAidCount": 0,
  "visualAids": []
}
```

---

## 7. Acceptance Criteria

### 7.1 visual_aid_sniffer (Agent F)

| # | Criterion | Validation |
|---|-----------|------------|
| F1 | Output matches `VisualAidAssessment` schema exactly | Pydantic model validation |
| F2 | `needs_visual_aids="no"` implies empty `visual_aids` array | `model_validator` |
| F3 | `needs_visual_aids="yes"` implies 1-4 items in `visual_aids` | `model_validator` |
| F4 | Visual aids are informative, not decorative — each serves a comprehension purpose | `graphic_type` enum + `description` min length |
| F5 | `placement_hint` references an existing heading or quoted phrase from the lesson | `@output_validator` with lesson body search |
| F6 | `description` is concrete enough to generate without guessing: includes graphic type, labels, learner takeaway | `description` min 20 chars + `graphic_type` field |
| F7 | Decision and specs reflect at least one UDL/profile signal | `udl_rationale` required field, min 10 chars |
| F8 | No duplicate visual aid purposes — each title is unique | `model_validator` on titles |
| F9 | Same inputs produce consistent yes/no decisions | `pydantic_evals` determinism checks |
| F10 | Schema failure triggers retry (up to 2), then structured error | `output_retries=2` on agent |

### 7.2 visual_aid_creator (Agent G)

| # | Criterion | Validation |
|---|-----------|------------|
| G1 | Output matches `VisualAidAsset` schema exactly | Pydantic model validation |
| G2 | `asset_type` prefers `mermaid` or `svg`; `png` only when necessary | System prompt instruction + eval rubric |
| G3 | Mermaid assets are valid syntax (diagram type declaration, balanced brackets, no scripts) | `_validate_mermaid_syntax()` |
| G4 | SVG assets are valid XML with `<svg>` root, no `<script>` elements | `_validate_svg_xml()` via `ET.fromstring` |
| G5 | PNG assets are valid base64 with PNG magic bytes | `_validate_png_base64()` |
| G6 | Assets are self-contained — no external URLs, images, fonts, or scripts | `validate_no_external_dependencies` field validator |
| G7 | Alt text is 1-3 sentences, does not start with "image of" or similar | `validate_alt_text_not_decorative` field validator |
| G8 | Alt text describes information conveyed (relationships, flow, structure), not appearance | Eval rubric + field validator |
| G9 | `title` matches the VisualAidSpec title from the sniffer | `@output_validator` title check |
| G10 | Accessibility-aware: simplified layout, clear labels for learners with needs | Dynamic instructions from profile + eval rubric |
| G11 | Schema failure triggers retry (up to 2), then structured error | `output_retries=2` on agent |

### 7.3 Pipeline Integration

| # | Criterion | Validation |
|---|-----------|------------|
| P1 | `SniffVisualAidsNode` runs after `WriteLessonNode` for every lesson | Graph iter sequence test |
| P2 | If sniffer returns "no", pipeline skips to `CreateActivityNode` | Graph branching test |
| P3 | If sniffer returns "yes", `CreateVisualAidsNode` runs once per spec | Graph iter + asset count verification |
| P4 | Lesson body contains `{{VISUAL_AID:<id>}}` placeholders after pipeline | Lesson body content assertion |
| P5 | VisualAid DB records created and linked to lesson with correct foreign key | DB query after pipeline run |
| P6 | Agent log entries created for both sniffer and creator runs | AgentLog query verification |
| P7 | Placeholder insertion does not corrupt surrounding Markdown | Markdown structure validation |

### 7.4 Frontend Rendering

| # | Criterion | Validation |
|---|-----------|------------|
| R1 | Mermaid placeholders render as visible diagrams via Mermaid.js | ADW visual check |
| R2 | SVG placeholders render as inline SVG with proper `role="img"` and `aria-label` | ADW accessibility tree check |
| R3 | PNG placeholders render as `<img>` tags with alt text | ADW DOM check |
| R4 | All visual aids wrapped in `<figure>` with `<figcaption>` | DOM structure assertion |
| R5 | Mermaid render failure shows graceful fallback with diagram source | Error state ADW test |
| R6 | Placeholders with no matching visual aid data are silently omitted | Unit test |
| R7 | Visual aids are visible in both light and dark mode | ADW visual check |

---

## 8. Verification

### 8.1 Unit Tests — Pydantic Model Validation

```python
import pytest
from pydantic import ValidationError

from app.models.visual_aids import (
    AssetType,
    GraphicType,
    VisualAidAsset,
    VisualAidAssessment,
    VisualAidSpec,
    VisualNeed,
)


class TestVisualAidAssessment:
    """Test VisualAidAssessment yes/no coherence and constraints."""

    def test_no_with_empty_array(self):
        """needs_visual_aids='no' with empty visual_aids is valid."""
        result = VisualAidAssessment(
            needs_visual_aids=VisualNeed.NO,
            visual_aids=[],
        )
        assert result.needs_visual_aids == VisualNeed.NO
        assert result.visual_aids == []

    def test_no_with_non_empty_array_rejected(self):
        """needs_visual_aids='no' with visual_aids items raises ValueError."""
        with pytest.raises(ValidationError, match="not empty"):
            VisualAidAssessment(
                needs_visual_aids=VisualNeed.NO,
                visual_aids=[_make_spec()],
            )

    def test_yes_with_one_item(self):
        """needs_visual_aids='yes' with 1 item is valid."""
        result = VisualAidAssessment(
            needs_visual_aids=VisualNeed.YES,
            visual_aids=[_make_spec()],
        )
        assert len(result.visual_aids) == 1

    def test_yes_with_four_items(self):
        """needs_visual_aids='yes' with 4 items is valid (max)."""
        specs = [_make_spec(title=f"Spec {i}") for i in range(4)]
        result = VisualAidAssessment(
            needs_visual_aids=VisualNeed.YES,
            visual_aids=specs,
        )
        assert len(result.visual_aids) == 4

    def test_yes_with_five_items_rejected(self):
        """needs_visual_aids='yes' with 5 items exceeds max of 4."""
        specs = [_make_spec(title=f"Spec {i}") for i in range(5)]
        with pytest.raises(ValidationError, match="Must be 1-4"):
            VisualAidAssessment(
                needs_visual_aids=VisualNeed.YES,
                visual_aids=specs,
            )

    def test_yes_with_empty_array_rejected(self):
        """needs_visual_aids='yes' with no items raises ValueError."""
        with pytest.raises(ValidationError, match="Must be 1-4"):
            VisualAidAssessment(
                needs_visual_aids=VisualNeed.YES,
                visual_aids=[],
            )

    def test_duplicate_titles_rejected(self):
        """Visual aids with identical titles are rejected."""
        specs = [_make_spec(title="Same Title"), _make_spec(title="Same Title")]
        with pytest.raises(ValidationError, match="unique"):
            VisualAidAssessment(
                needs_visual_aids=VisualNeed.YES,
                visual_aids=specs,
            )


class TestVisualAidAsset:
    """Test VisualAidAsset format-specific validation."""

    def test_valid_mermaid(self):
        """Valid Mermaid syntax passes validation."""
        asset = VisualAidAsset(
            asset_type=AssetType.MERMAID,
            asset="flowchart TD\n  A[Start] --> B[End]\n  B --> C[Done]",
            alt_text="A flowchart showing three stages from Start to End to Done.",
            title="Process Flow",
        )
        assert asset.asset_type == AssetType.MERMAID

    def test_invalid_mermaid_start_rejected(self):
        """Mermaid asset not starting with diagram type is rejected."""
        with pytest.raises(ValidationError, match="valid diagram type"):
            VisualAidAsset(
                asset_type=AssetType.MERMAID,
                asset="this is not mermaid syntax at all",
                alt_text="A flowchart showing the basic process.",
                title="Bad Mermaid",
            )

    def test_mermaid_unbalanced_brackets_rejected(self):
        """Mermaid with unbalanced brackets is rejected."""
        with pytest.raises(ValidationError, match="unbalanced"):
            VisualAidAsset(
                asset_type=AssetType.MERMAID,
                asset="flowchart TD\n  A[Start --> B[End]",
                alt_text="A flowchart showing two stages.",
                title="Unbalanced",
            )

    def test_mermaid_with_script_rejected(self):
        """Mermaid containing <script> is rejected."""
        with pytest.raises(ValidationError, match="script"):
            VisualAidAsset(
                asset_type=AssetType.MERMAID,
                asset="flowchart TD\n  A[Start] --> B[End]\n  <script>alert('xss')</script>",
                alt_text="A flowchart with injected script.",
                title="Script Injection",
            )

    def test_valid_svg(self):
        """Valid SVG XML passes validation."""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">'
            '<text x="10" y="50">Hello</text>'
            "</svg>"
        )
        asset = VisualAidAsset(
            asset_type=AssetType.SVG,
            asset=svg,
            alt_text="A simple text element displaying Hello.",
            title="SVG Test",
        )
        assert asset.asset_type == AssetType.SVG

    def test_invalid_svg_xml_rejected(self):
        """Malformed SVG XML is rejected."""
        with pytest.raises(ValidationError, match="not valid XML"):
            VisualAidAsset(
                asset_type=AssetType.SVG,
                asset="<svg><text>unclosed",
                alt_text="A broken SVG element.",
                title="Bad SVG",
            )

    def test_svg_with_script_rejected(self):
        """SVG containing <script> is rejected."""
        svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><text>Hi</text></svg>'
        with pytest.raises(ValidationError, match="script"):
            VisualAidAsset(
                asset_type=AssetType.SVG,
                asset=svg,
                alt_text="An SVG with injected script.",
                title="Script SVG",
            )

    def test_svg_non_svg_root_rejected(self):
        """XML that is not rooted at <svg> is rejected."""
        with pytest.raises(ValidationError, match="root element must be <svg>"):
            VisualAidAsset(
                asset_type=AssetType.SVG,
                asset="<div><text>Not SVG</text></div>",
                alt_text="A div element, not SVG.",
                title="Not SVG",
            )

    def test_alt_text_starts_with_image_of_rejected(self):
        """Alt text starting with 'image of' is rejected."""
        with pytest.raises(ValidationError, match="image of"):
            VisualAidAsset(
                asset_type=AssetType.MERMAID,
                asset="flowchart TD\n  A[Start] --> B[End]\n  B --> C[Done]",
                alt_text="Image of a flowchart showing the process.",
                title="Bad Alt",
            )

    def test_external_url_in_asset_rejected(self):
        """Assets with external URLs are rejected."""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<image href="https://evil.com/img.png" />'
            '<text x="10" y="50">Label</text>'
            "</svg>"
        )
        with pytest.raises(ValidationError, match="self-contained"):
            VisualAidAsset(
                asset_type=AssetType.SVG,
                asset=svg,
                alt_text="An SVG referencing an external image.",
                title="External Ref",
            )


def _make_spec(title: str = "Test Visual Aid") -> VisualAidSpec:
    """Factory for creating valid VisualAidSpec test fixtures."""
    return VisualAidSpec(
        title=title,
        description=(
            "A flowchart showing the three-step data processing pipeline "
            "with labeled nodes for Input, Transform, and Output stages. "
            "Learner takeaway: understand sequential data flow."
        ),
        placement_hint="After the 'Data Processing Pipeline' section heading",
        graphic_type=GraphicType.FLOWCHART,
        udl_rationale=(
            "Supports visual learners (UDL Representation) by providing "
            "a spatial representation of the sequential process."
        ),
    )
```

### 8.2 Unit Tests — Output Validators

```python
import pytest
from pydantic_ai import ModelRetry
from unittest.mock import AsyncMock, MagicMock

from app.agents.visual_aid_sniffer import validate_placement_hints
from app.agents.visual_aid_creator import validate_asset_content


class TestSnifferOutputValidator:
    """Test placement hint validation against lesson content."""

    @pytest.mark.anyio
    async def test_valid_heading_reference(self):
        """Placement hint referencing an existing heading passes."""
        ctx = _make_ctx(lesson_body="# Introduction\n\nSome text\n\n# Data Flow\n\nMore text")
        output = _make_assessment(
            placement_hint="After the 'Data Flow' section"
        )
        result = await validate_placement_hints(ctx, output)
        assert result is output

    @pytest.mark.anyio
    async def test_invalid_heading_reference_retries(self):
        """Placement hint with no matching heading raises ModelRetry."""
        ctx = _make_ctx(lesson_body="# Introduction\n\nSome text\n\n# Summary\n\nMore text")
        output = _make_assessment(
            placement_hint="After the 'Nonexistent Section' heading"
        )
        with pytest.raises(ModelRetry, match="recognizable heading"):
            await validate_placement_hints(ctx, output)

    @pytest.mark.anyio
    async def test_quoted_phrase_reference(self):
        """Placement hint with quoted phrase found in lesson passes."""
        ctx = _make_ctx(
            lesson_body="# Introduction\n\nThe data pipeline works in three stages."
        )
        output = _make_assessment(
            placement_hint="After 'three stages' in the Introduction"
        )
        result = await validate_placement_hints(ctx, output)
        assert result is output


class TestCreatorOutputValidator:
    """Test creator asset content validation."""

    @pytest.mark.anyio
    async def test_title_mismatch_retries(self):
        """Mismatched title raises ModelRetry."""
        ctx = _make_ctx(spec_title="Pipeline Flowchart")
        output = _make_asset(title="Different Title")
        with pytest.raises(ModelRetry, match="must match"):
            await validate_asset_content(ctx, output)

    @pytest.mark.anyio
    async def test_mermaid_too_simple_retries(self):
        """Mermaid with fewer than 3 non-comment lines raises ModelRetry."""
        ctx = _make_ctx(spec_title="Simple")
        output = _make_asset(
            title="Simple",
            asset_type=AssetType.MERMAID,
            asset="flowchart TD\n  A --> B",
        )
        with pytest.raises(ModelRetry, match="too simple"):
            await validate_asset_content(ctx, output)

    @pytest.mark.anyio
    async def test_svg_empty_content_retries(self):
        """SVG with no visible content raises ModelRetry."""
        ctx = _make_ctx(spec_title="Empty SVG")
        output = _make_asset(
            title="Empty SVG",
            asset_type=AssetType.SVG,
            asset='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
        )
        with pytest.raises(ModelRetry, match="no visible content"):
            await validate_asset_content(ctx, output)
```

### 8.3 Unit Tests — Agents (TestModel)

```python
import pytest
from pydantic_ai.models.test import TestModel
from pydantic_ai import models

from app.agents.visual_aid_sniffer import visual_aid_sniffer
from app.agents.visual_aid_creator import visual_aid_creator
from app.models.visual_aids import AssetType, GraphicType, VisualNeed

# Block real API calls
models.ALLOW_MODEL_REQUESTS = False


class TestVisualAidSnifferAgent:
    """Test visual_aid_sniffer with TestModel."""

    @pytest.mark.anyio
    async def test_sniffer_produces_valid_assessment(self):
        """Sniffer with TestModel produces schema-valid output."""
        with visual_aid_sniffer.override(
            model=TestModel(
                custom_output_args={
                    "needs_visual_aids": "yes",
                    "visual_aids": [
                        {
                            "title": "Process Flowchart",
                            "description": (
                                "A flowchart showing the three-step data "
                                "pipeline with Input, Transform, and Output "
                                "nodes. Learner takeaway: sequential data flow."
                            ),
                            "placement_hint": "After the 'Pipeline Steps' section",
                            "graphic_type": "flowchart",
                            "udl_rationale": (
                                "Supports visual representation preference "
                                "from learner profile."
                            ),
                        }
                    ],
                }
            ),
            deps=mock_deps,
        ):
            result = await visual_aid_sniffer.run(
                "Analyze this lesson about data pipelines."
            )
            assert result.output.needs_visual_aids == VisualNeed.YES
            assert len(result.output.visual_aids) == 1
            assert result.output.visual_aids[0].graphic_type == GraphicType.FLOWCHART


class TestVisualAidCreatorAgent:
    """Test visual_aid_creator with TestModel."""

    @pytest.mark.anyio
    async def test_creator_produces_valid_mermaid(self):
        """Creator with TestModel produces valid Mermaid asset."""
        with visual_aid_creator.override(
            model=TestModel(
                custom_output_args={
                    "asset_type": "mermaid",
                    "asset": (
                        "flowchart TD\n"
                        "  A[Input Data] --> B[Transform]\n"
                        "  B --> C[Output Results]\n"
                        "  C --> D[Storage]"
                    ),
                    "alt_text": (
                        "A flowchart showing data flowing from Input Data "
                        "through Transform to Output Results and finally Storage."
                    ),
                    "title": "Data Pipeline Flow",
                }
            ),
            deps=mock_deps,
        ):
            result = await visual_aid_creator.run(
                "Generate a flowchart for the data pipeline."
            )
            assert result.output.asset_type == AssetType.MERMAID
            assert result.output.asset.startswith("flowchart")
```

### 8.4 Integration Tests — Pipeline

```python
import pytest
from pydantic_ai.models.test import TestModel

from app.pipeline.graph import course_generation_graph
from app.pipeline.state import CourseGenerationState
from app.pipeline.nodes import (
    CreateActivityNode,
    CreateVisualAidsNode,
    DescribeCourseNode,
    PlanLessonNode,
    SniffVisualAidsNode,
    WriteLessonNode,
)


class TestPipelineWithVisualAids:
    """Integration tests for the visual aid pipeline nodes."""

    @pytest.mark.anyio
    async def test_full_pipeline_with_visuals(self):
        """Pipeline runs sniffer and creator when visuals are needed."""
        state = _make_pipeline_state()

        # Override all agents with TestModel
        async with course_generation_graph.iter(
            DescribeCourseNode(), state=state
        ) as graph_run:
            node_sequence = []
            async for node in graph_run:
                node_sequence.append(type(node).__name__)

        assert "SniffVisualAidsNode" in node_sequence
        assert "CreateVisualAidsNode" in node_sequence

    @pytest.mark.anyio
    async def test_pipeline_skips_creator_when_no_visuals(self):
        """Pipeline skips CreateVisualAidsNode when sniffer says no."""
        state = _make_pipeline_state(sniffer_returns_no=True)

        async with course_generation_graph.iter(
            DescribeCourseNode(), state=state
        ) as graph_run:
            node_sequence = []
            async for node in graph_run:
                node_sequence.append(type(node).__name__)

        assert "SniffVisualAidsNode" in node_sequence
        assert "CreateVisualAidsNode" not in node_sequence
        assert "CreateActivityNode" in node_sequence

    @pytest.mark.anyio
    async def test_lesson_body_contains_placeholders_after_pipeline(self):
        """Lesson body has {{VISUAL_AID:<id>}} placeholders after visual generation."""
        state = _make_pipeline_state()

        async with course_generation_graph.iter(
            DescribeCourseNode(), state=state
        ) as graph_run:
            async for _ in graph_run:
                pass

        assert "{{VISUAL_AID:" in state.lesson_content["lessonBody"]

    @pytest.mark.anyio
    async def test_visual_aid_db_records_created(self, db_session):
        """VisualAid rows are persisted to the database after pipeline."""
        state = _make_pipeline_state(db_session=db_session)

        async with course_generation_graph.iter(
            DescribeCourseNode(), state=state
        ) as graph_run:
            async for _ in graph_run:
                pass

        from app.db.models import VisualAid
        from sqlalchemy import select

        result = await db_session.execute(
            select(VisualAid).where(
                VisualAid.lesson_id == state.current_lesson_id
            )
        )
        visual_aids = result.scalars().all()
        assert len(visual_aids) >= 1

    @pytest.mark.anyio
    async def test_agent_logs_recorded(self, db_session):
        """AgentLog entries created for sniffer and creator runs."""
        state = _make_pipeline_state(db_session=db_session)

        async with course_generation_graph.iter(
            DescribeCourseNode(), state=state
        ) as graph_run:
            async for _ in graph_run:
                pass

        from app.db.models import AgentLog
        from sqlalchemy import select

        result = await db_session.execute(
            select(AgentLog).where(
                AgentLog.agent_name.in_(["visual_aid_sniffer", "visual_aid_creator"])
            )
        )
        logs = result.scalars().all()
        agent_names = {log.agent_name for log in logs}
        assert "visual_aid_sniffer" in agent_names
        assert "visual_aid_creator" in agent_names
```

### 8.5 E2E Tests — Live LLM

```python
import pytest

from app.models.visual_aids import AssetType, VisualNeed


@pytest.mark.e2e
@pytest.mark.slow
class TestVisualAidE2E:
    """E2E tests with live LLM. CI-gated, requires API keys."""

    @pytest.mark.anyio
    async def test_visual_topic_triggers_sniffer_yes(self):
        """Course on a visual topic (Data Structures) triggers sniffer to say 'yes'."""
        result = await generate_course(
            description="Introduction to Data Structures",
            objectives=[
                "Understand arrays, linked lists, and trees",
                "Compare time complexity of common operations",
                "Implement a binary search tree",
            ],
        )
        sniffer_results = [
            lesson.visual_aid_assessment
            for lesson in result.lessons
            if lesson.visual_aid_assessment is not None
        ]
        # At least one lesson should need visuals for a data structures course
        assert any(
            r.needs_visual_aids == VisualNeed.YES for r in sniffer_results
        ), "Expected at least one lesson to need visual aids for a Data Structures course"

    @pytest.mark.anyio
    async def test_generated_mermaid_is_renderable(self):
        """Generated Mermaid assets can be parsed without errors."""
        result = await generate_course_with_visuals(
            description="Understanding Git Workflows",
            objectives=["Understand branching and merging strategies"],
        )
        mermaid_assets = [
            va for va in result.visual_aids if va.asset_type == AssetType.MERMAID
        ]
        for asset in mermaid_assets:
            # Basic structural checks (full render test in ADW)
            assert asset.asset.strip().split("\n")[0].strip().split()[0] in [
                "flowchart", "graph", "sequenceDiagram", "classDiagram",
                "stateDiagram", "erDiagram", "gantt", "pie", "gitgraph",
                "mindmap", "timeline",
            ]

    @pytest.mark.anyio
    async def test_generated_svg_is_valid_xml(self):
        """Generated SVG assets are well-formed XML."""
        import xml.etree.ElementTree as ET

        result = await generate_course_with_visuals(
            description="Network Architecture Basics",
            objectives=["Understand the OSI model layers"],
        )
        svg_assets = [
            va for va in result.visual_aids if va.asset_type == AssetType.SVG
        ]
        for asset in svg_assets:
            root = ET.fromstring(asset.asset)
            tag = root.tag
            assert tag == "svg" or tag.endswith("}svg")

    @pytest.mark.anyio
    async def test_alt_text_is_meaningful(self):
        """Generated alt text describes information, not appearance."""
        result = await generate_course_with_visuals(
            description="Introduction to Algorithms",
            objectives=["Understand sorting algorithm comparisons"],
        )
        for va in result.visual_aids:
            assert not va.alt_text.lower().startswith("image of")
            assert not va.alt_text.lower().startswith("picture of")
            assert len(va.alt_text) >= 15
            # Should contain at least one informational word
            informational_words = [
                "shows", "illustrates", "compares", "displays",
                "represents", "demonstrates", "maps", "outlines",
                "describes", "depicts", "flow", "relationship",
                "structure", "stages", "steps",
            ]
            assert any(
                word in va.alt_text.lower() for word in informational_words
            ), f"Alt text lacks informational content: '{va.alt_text}'"
```

### 8.6 Evaluation Suite (pydantic_evals)

```python
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import IsInstance, LLMJudge

from app.models.visual_aids import VisualAidAssessment, VisualAidAsset

# Sniffer evaluation dataset
sniffer_dataset = Dataset(
    cases=[
        Case(
            name="visual_topic_data_structures",
            inputs={
                "lesson_body": "# Binary Trees\n\nA binary tree is a hierarchical data structure...\n\n## Tree Traversal\n\nThere are three main traversal methods: in-order, pre-order, and post-order...",
                "lesson_title": "Understanding Binary Trees",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAssessment"),
                LLMJudge(
                    rubric=(
                        "The sniffer correctly identifies that a lesson about "
                        "binary trees and tree traversal would benefit from a "
                        "visual diagram. needs_visual_aids should be 'yes' and "
                        "at least one visual aid should be a tree/hierarchy diagram."
                    )
                ),
            ],
        ),
        Case(
            name="text_heavy_no_visuals",
            inputs={
                "lesson_body": "# The History of Jazz\n\nJazz originated in the African-American communities of New Orleans...\n\n## Key Figures\n\nLouis Armstrong pioneered...",
                "lesson_title": "Jazz History Overview",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAssessment"),
                LLMJudge(
                    rubric=(
                        "A narrative history lesson about jazz does not strongly "
                        "benefit from informative graphics (no processes, "
                        "comparisons, or structures). The sniffer may reasonably "
                        "return 'no' or suggest a timeline. If 'yes', the "
                        "rationale must be well-grounded."
                    )
                ),
            ],
        ),
        Case(
            name="comparison_topic",
            inputs={
                "lesson_body": "# SQL vs NoSQL Databases\n\n## Key Differences\n\nSQL databases use structured schemas while NoSQL...\n\n## When to Use Each\n\nChoose SQL when you need ACID compliance...",
                "lesson_title": "Comparing Database Types",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAssessment"),
                LLMJudge(
                    rubric=(
                        "A comparison lesson should trigger 'yes' with at least "
                        "one comparison table or side-by-side diagram. The "
                        "description should specify comparison categories."
                    )
                ),
            ],
        ),
        Case(
            name="process_topic",
            inputs={
                "lesson_body": "# CI/CD Pipeline\n\n## Build Stage\n\nCode is compiled and tested...\n\n## Test Stage\n\nAutomated tests run...\n\n## Deploy Stage\n\nArtifacts are deployed...",
                "lesson_title": "Understanding CI/CD",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAssessment"),
                LLMJudge(
                    rubric=(
                        "A lesson describing a multi-stage pipeline process "
                        "should trigger 'yes' with a flowchart or process "
                        "diagram. The placement hint should reference a specific "
                        "stage heading."
                    )
                ),
            ],
        ),
        Case(
            name="determinism_check",
            inputs={
                "lesson_body": "# Sorting Algorithms\n\n## Bubble Sort\n\nBubble sort works by...\n\n## Quick Sort\n\nQuick sort uses divide and conquer...\n\n## Comparison\n\n| Algorithm | Best | Average | Worst |\n...",
                "lesson_title": "Sorting Algorithm Analysis",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAssessment"),
                LLMJudge(
                    rubric=(
                        "A sorting algorithms lesson with existing comparison "
                        "table should either (a) return 'no' because the table "
                        "already covers comparisons, or (b) suggest a different "
                        "type of visual (e.g., step-by-step diagram of an "
                        "algorithm). Must not suggest duplicating the existing table."
                    )
                ),
            ],
        ),
    ]
)

# Creator evaluation dataset
creator_dataset = Dataset(
    cases=[
        Case(
            name="mermaid_flowchart",
            inputs={
                "spec_title": "CI/CD Pipeline Flow",
                "spec_description": "A flowchart showing Build, Test, and Deploy stages with decision points for pass/fail at each gate.",
                "graphic_type": "flowchart",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAsset"),
                LLMJudge(
                    rubric=(
                        "The asset should be Mermaid format (preferred for "
                        "flowcharts), contain Build/Test/Deploy nodes, include "
                        "decision points, and have alt text describing the "
                        "pipeline flow."
                    )
                ),
            ],
        ),
        Case(
            name="svg_concept_map",
            inputs={
                "spec_title": "OOP Concepts Relationship",
                "spec_description": "A concept map showing relationships between Encapsulation, Inheritance, Polymorphism, and Abstraction with labeled connections.",
                "graphic_type": "concept_map",
            },
            evaluators=[
                IsInstance(type_name="VisualAidAsset"),
                LLMJudge(
                    rubric=(
                        "The asset should show all four OOP concepts with "
                        "labeled connections. SVG or Mermaid format. Alt text "
                        "must describe the relationships, not just list the concepts."
                    )
                ),
            ],
        ),
        Case(
            name="accessibility_adapted",
            inputs={
                "spec_title": "Process Steps",
                "spec_description": "A simple 4-step process diagram with clear labels.",
                "graphic_type": "process",
                "accessibility_needs": ["low vision", "cognitive load reduction"],
            },
            evaluators=[
                IsInstance(type_name="VisualAidAsset"),
                LLMJudge(
                    rubric=(
                        "The asset should have simplified layout, large clear "
                        "labels, minimal visual complexity, and generous spacing "
                        "appropriate for a learner with low vision and cognitive "
                        "load concerns."
                    )
                ),
            ],
        ),
    ]
)
```

### 8.7 ADW Implementation Pattern

ADW tests are **single-file `uv` scripts** using [PEP 723 inline script metadata](https://peps.python.org/pep-0723/). Each test is a self-contained `.py` file that can be run directly with `uv run`:

```bash
# Run a single ADW test
uv run tests/adw/07_visual_aids.py

# Run all ADW tests
uv run tests/adw/run_all.py
```

**Script structure** — every ADW test follows this pattern:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""ADW Test: Visual Aids — visual aid generation and rendering verification."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = """\
<the existing ADW prompt content goes here — see test prompt below>
"""

def main() -> int:
    # 1. Preflight checks
    if not shutil.which("claude"):
        print("SKIP: 'claude' CLI not found on PATH. Install Claude Code to run ADW tests.")
        return 0  # Skip, don't fail

    if not shutil.which("agent-browser"):
        print("SKIP: 'agent-browser' not found. Run: npm install -g agent-browser && agent-browser install")
        return 0

    # 2. Ensure results directory exists
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    # 3. Run Claude Code in headless mode
    print(f"Running ADW test: {Path(__file__).stem}")
    result = subprocess.run(
        [
            "claude", "-p", PROMPT,
            "--output-format", "json",
            "--allowedTools", "Bash,Read",
            "--max-turns", "25",
            "--model", "claude-sonnet-4-6",
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parents[2]),  # project root
        timeout=300,  # 5 minute timeout
    )

    if result.returncode != 0:
        print(f"FAIL: claude exited with code {result.returncode}")
        print(result.stderr)
        return 1

    # 4. Parse and save results
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"FAIL: Could not parse claude output as JSON")
        print(result.stdout[:500])
        return 1

    result_file = results_dir / f"{Path(__file__).stem}.json"
    result_file.write_text(json.dumps(output, indent=2))
    print(f"Results saved to {result_file}")

    # 5. Report
    agent_result = output.get("result", "")
    print(f"\nAgent response:\n{agent_result[:1000]}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Orchestrator** — `tests/adw/run_all.py` runs all ADW tests in sequence:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Run all ADW tests in order."""

import subprocess
import sys
from pathlib import Path

def main() -> int:
    tests_dir = Path(__file__).parent
    test_files = sorted(tests_dir.glob("[0-9]*.py"))

    results = []
    for test_file in test_files:
        print(f"\n{'='*60}")
        print(f"Running: {test_file.name}")
        print(f"{'='*60}")
        ret = subprocess.run([sys.executable, str(test_file)]).returncode
        results.append((test_file.name, ret))

    print(f"\n{'='*60}")
    print("ADW Test Summary")
    print(f"{'='*60}")
    for name, ret in results:
        status = "PASS" if ret == 0 else "FAIL"
        print(f"  {status}: {name}")

    passed = sum(1 for _, r in results if r == 0)
    print(f"\n{passed}/{len(results)} passed")
    return 0 if all(r == 0 for _, r in results) else 1

if __name__ == "__main__":
    sys.exit(main())
```

### 8.8 ADW Browser Test

```markdown
<!-- tests/adw/prompts/07_visual_aids.md -->

You are a QA tester for the 1111 School learning platform.
The app is running at http://localhost:5173 and the backend at http://localhost:8000.
Use agent-browser to automate the browser.

TEST: Visual Aid Generation and Rendering

Steps:
1. `agent-browser open http://localhost:5173`
2. `agent-browser snapshot -i` to orient
3. Create a new course with description "Introduction to Data Structures and Algorithms"
   and objectives:
   - "Understand arrays, linked lists, and trees"
   - "Compare time complexity of sorting algorithms"
   - "Implement a binary search tree"
4. Click Generate and wait for course generation to complete
5. Navigate through each lesson, taking snapshots

VERIFY and report pass/fail for each:

Visual Aid Presence:
- [ ] At least one lesson contains a visual aid (diagram, flowchart, or chart)
- [ ] Visual aids are rendered inline within the lesson content (not broken placeholders)
- [ ] No raw `{{VISUAL_AID:...}}` placeholder text is visible to the user

Mermaid Rendering:
- [ ] If Mermaid diagrams are present, they render as visible SVG graphics (not raw text)
- [ ] Mermaid diagrams have visible labels and nodes

SVG Rendering:
- [ ] If inline SVGs are present, they render as visible graphics
- [ ] SVG content is not displayed as raw XML text

Accessibility:
- [ ] Run `agent-browser snapshot` (full accessibility tree) on a lesson with visual aids
- [ ] Verify visual aids have `role="img"` in the accessibility tree
- [ ] Verify `aria-label` (alt text) is present and non-empty for each visual
- [ ] Alt text does not start with "image of" or "picture of"
- [ ] Visual aids are wrapped in `<figure>` elements with `<figcaption>`

Visual Quality:
- [ ] Take annotated screenshots of each lesson with visual aids:
  `agent-browser screenshot --annotate ./test-results/visual-aid-lesson-N.png`
- [ ] Visual aids are legible (not cropped, overlapping, or illegibly small)
- [ ] Visual aids appear contextually placed (near relevant content, not at random locations)

Dark Mode:
- [ ] Toggle to dark mode (if theme switcher available)
- [ ] Re-snapshot: visual aids are still visible and legible in dark mode
- [ ] Take dark mode screenshot: `agent-browser screenshot --annotate ./test-results/visual-aid-dark-mode.png`

Output a JSON object:
{
  "test": "visual_aids",
  "passed": true/false,
  "checks": [
    {"name": "check_name", "passed": true/false, "notes": "..."}
  ],
  "visualAidCount": N,
  "assetTypes": ["mermaid", "svg"],
  "screenshots": ["path1.png", "path2.png"],
  "notes": "Overall observations about visual aid quality and rendering"
}
```

---

## 9. Definition of Done

All of the following must be true for PRD 7 to be considered complete:

- [ ] **Models**: `VisualAidAssessment`, `VisualAidSpec`, `VisualAidAsset`, `VisualAidSnifferInput`, `VisualAidCreatorInput`, and all supporting enums/types are implemented with full validation
- [ ] **Agents**: `visual_aid_sniffer` and `visual_aid_creator` are implemented with system prompts, dynamic `@agent.instructions` for learner context, and `@output_validator` for business rules
- [ ] **Pipeline**: `SniffVisualAidsNode` and `CreateVisualAidsNode` are integrated into the `pydantic_graph` course generation pipeline after `WriteLessonNode`
- [ ] **Branching**: Pipeline correctly branches — skips creator when sniffer returns "no", runs creator per spec when "yes"
- [ ] **Placeholders**: `{{VISUAL_AID:<id>}}` tokens are inserted into lesson Markdown body at contextually appropriate locations
- [ ] **Database**: `visual_aids` table created via Alembic migration, `VisualAid` SQLAlchemy model with `lesson_id` foreign key, `Lesson.visual_aids` relationship
- [ ] **API**: `GET /api/lessons/{id}/visual-aids` returns visual aids for a lesson; `GET /api/lessons/{id}` response includes `visualAids` array; `POST /api/lessons/{id}/visual-aids/regenerate` triggers re-generation
- [ ] **Frontend**: `VisualAidRenderer` component dispatches by asset type (Mermaid.js, inline SVG, img+alt); `LessonContent` splits Markdown at placeholders and interleaves visual components
- [ ] **Mermaid.js**: Installed as frontend dependency, initialized with `securityLevel: "strict"`, renders diagrams with error fallback showing source
- [ ] **Accessibility**: All visual aids have `role="img"`, `aria-label` with meaningful alt text, `<figure>`/`<figcaption>` wrappers; alt text appears in accessibility tree
- [ ] **Security**: No `<script>` elements in SVG/Mermaid, no external URLs in assets, Mermaid `securityLevel: "strict"`, SVG validated as XML before rendering
- [ ] **Unit tests pass**: Model validation (yes/no coherence, asset type validation, Mermaid syntax, SVG XML, alt text rules, external dependency rejection)
- [ ] **Output validator tests pass**: Placement hint validation against lesson headings, title matching, minimum complexity checks
- [ ] **Agent tests pass**: Both agents produce schema-valid output with TestModel
- [ ] **Integration tests pass**: Full pipeline with visual nodes (agents mocked), placeholder insertion verified, DB records created, agent logs recorded
- [ ] **E2E tests pass**: Visual topic course generates visuals with live LLM, Mermaid/SVG validates, alt text is meaningful
- [ ] **ADW test passes**: Visual aids render in browser, are present in accessibility tree with alt text, display correctly in both light and dark mode
- [ ] **Agent logs**: Both `visual_aid_sniffer` and `visual_aid_creator` runs are recorded in `AgentLog` with prompt, output, timing, tokens, model metadata, and status
