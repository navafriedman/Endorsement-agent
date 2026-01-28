"""SQLAlchemy database models for questionnaire management with version control."""

import json
from datetime import datetime
from typing import Optional

from . import db


class Questionnaire(db.Model):
    """A questionnaire containing election race configurations."""
    __tablename__ = 'questionnaires'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    # Geographic targeting
    state = db.Column(db.String(2), nullable=True)  # Two-letter state code
    city = db.Column(db.String(100), nullable=True)
    region = db.Column(db.String(100), nullable=True)  # County, district, etc.

    # Date targeting
    election_date = db.Column(db.Date, nullable=True)
    primary_date = db.Column(db.Date, nullable=True)

    # Current version info
    current_version = db.Column(db.Integer, default=1)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    versions = db.relationship('QuestionnaireVersion', backref='questionnaire',
                               lazy='dynamic', cascade='all, delete-orphan')
    changes = db.relationship('ChangeLog', backref='questionnaire',
                              lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'state': self.state,
            'city': self.city,
            'region': self.region,
            'election_date': self.election_date.isoformat() if self.election_date else None,
            'primary_date': self.primary_date.isoformat() if self.primary_date else None,
            'current_version': self.current_version,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def get_current_content(self) -> Optional[dict]:
        """Get the content of the current version."""
        version = self.versions.filter_by(version_number=self.current_version).first()
        if version:
            return version.get_content()
        return None

    def create_version(self, content: dict, change_summary: str = None) -> 'QuestionnaireVersion':
        """Create a new version with the given content."""
        new_version_number = self.current_version + 1

        version = QuestionnaireVersion(
            questionnaire_id=self.id,
            version_number=new_version_number,
            content_json=json.dumps(content, indent=2),
            change_summary=change_summary
        )
        db.session.add(version)

        self.current_version = new_version_number

        return version


class QuestionnaireVersion(db.Model):
    """A version of a questionnaire's content."""
    __tablename__ = 'questionnaire_versions'

    id = db.Column(db.Integer, primary_key=True)
    questionnaire_id = db.Column(db.Integer, db.ForeignKey('questionnaires.id'), nullable=False)
    version_number = db.Column(db.Integer, nullable=False)
    content_json = db.Column(db.Text, nullable=False)  # Full JSON content
    change_summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('questionnaire_id', 'version_number', name='unique_version'),
    )

    def get_content(self) -> dict:
        """Parse and return the JSON content."""
        return json.loads(self.content_json)

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'questionnaire_id': self.questionnaire_id,
            'version_number': self.version_number,
            'change_summary': self.change_summary,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ChangeLog(db.Model):
    """Track individual changes made to questionnaires."""
    __tablename__ = 'change_logs'

    id = db.Column(db.Integer, primary_key=True)
    questionnaire_id = db.Column(db.Integer, db.ForeignKey('questionnaires.id'), nullable=False)
    version_from = db.Column(db.Integer, nullable=True)  # Null for creation
    version_to = db.Column(db.Integer, nullable=False)

    # Change details
    change_type = db.Column(db.String(50), nullable=False)  # create, update, rollback, import
    change_summary = db.Column(db.Text, nullable=True)
    change_details = db.Column(db.Text, nullable=True)  # JSON diff or detailed changes

    # Metadata
    user_agent = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'questionnaire_id': self.questionnaire_id,
            'version_from': self.version_from,
            'version_to': self.version_to,
            'change_type': self.change_type,
            'change_summary': self.change_summary,
            'change_details': json.loads(self.change_details) if self.change_details else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class CrawlJob(db.Model):
    """Track crawler jobs triggered from the UI."""
    __tablename__ = 'crawl_jobs'

    id = db.Column(db.Integer, primary_key=True)
    questionnaire_id = db.Column(db.Integer, db.ForeignKey('questionnaires.id'), nullable=False)
    version_number = db.Column(db.Integer, nullable=False)

    # Job status
    status = db.Column(db.String(50), default='pending')  # pending, running, completed, failed
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Results
    result_path = db.Column(db.String(500), nullable=True)
    error_message = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    questionnaire = db.relationship('Questionnaire', backref=db.backref('crawl_jobs', lazy='dynamic'))

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'questionnaire_id': self.questionnaire_id,
            'version_number': self.version_number,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'result_path': self.result_path,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
