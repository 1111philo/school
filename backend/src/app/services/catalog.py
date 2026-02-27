import json
from pathlib import Path

from pydantic import BaseModel


class PredefinedCourse(BaseModel):
    course_id: str = ""
    version: str = "1.0.0"
    name: str
    description: str
    learning_objectives: list[str] = []
    tags: list[str] = []
    estimated_hours: float = 0

    model_config = {"alias_generator": lambda s: s, "populate_by_name": True}


# In-memory catalog loaded at startup
_catalog: dict[str, PredefinedCourse] = {}

COURSES_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "app" / "courses"


def load_catalog(courses_dir: Path | None = None) -> dict[str, PredefinedCourse]:
    global _catalog
    _catalog = {}
    base = courses_dir or COURSES_DIR
    if not base.exists():
        return _catalog

    for course_dir in sorted(base.iterdir()):
        course_file = course_dir / "course.json"
        if course_file.exists():
            data = json.loads(course_file.read_text())
            # Handle camelCase keys from existing JSON files
            course = PredefinedCourse(
                course_id=data.get("courseId", course_dir.name),
                version=data.get("version", "1.0.0"),
                name=data.get("name", ""),
                description=data.get("description", ""),
                learning_objectives=data.get("learningObjectives", []),
                tags=data.get("tags", []),
                estimated_hours=data.get("estimatedHours", 0),
            )
            _catalog[course.course_id] = course

    return _catalog


def get_catalog() -> dict[str, PredefinedCourse]:
    return _catalog


def get_course(course_id: str) -> PredefinedCourse | None:
    return _catalog.get(course_id)
