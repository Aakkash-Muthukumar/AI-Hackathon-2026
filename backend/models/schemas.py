from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


class AssignmentSource(str, Enum):
    CANVAS = "canvas"
    NOTION = "notion"
    GOOGLE_CLASSROOM = "google_classroom"
    TRELLO = "trello"
    JIRA = "jira"
    ASANA = "asana"
    CLICKUP = "clickup"
    ODOO = "odoo"
    MANUAL = "manual"


class RubricItem(BaseModel):
    criterion: str
    points: Optional[int] = None
    description: str
    weight: Optional[float] = None


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    completion: float = 0.0  # 0–100
    success_criteria: List[str] = []
    expected_outputs: List[str] = []
    rubric_alignment: List[str] = []
    missing_requirements: List[str] = []


class Assignment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    deadline: Optional[datetime] = None
    source: AssignmentSource = AssignmentSource.MANUAL
    prompt: str
    rubric: List[RubricItem] = []
    tasks: List[Task] = []
    overall_completion: float = 0.0
    document_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssignmentCreate(BaseModel):
    title: str
    deadline: Optional[datetime] = None
    source: AssignmentSource = AssignmentSource.MANUAL
    prompt: str
    rubric: List[RubricItem] = []
    document_url: Optional[str] = None


class ProgressUpdateRequest(BaseModel):
    document_content: str
    assignment_id: str


class DiscoveryRequest(BaseModel):
    platform: AssignmentSource
    credentials: dict
