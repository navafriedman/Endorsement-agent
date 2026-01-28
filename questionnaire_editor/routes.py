"""Flask routes for questionnaire editor API and web interface."""

import json
import os
import subprocess
import tempfile
from datetime import datetime
from difflib import unified_diff

from flask import Blueprint, jsonify, render_template, request, send_file

from . import db
from .db_models import ChangeLog, CrawlJob, Questionnaire, QuestionnaireVersion

bp = Blueprint('main', __name__)


# ============================================================================
# Web Interface Routes
# ============================================================================

@bp.route('/')
def index():
    """Main questionnaire editor interface."""
    return render_template('index.html')


# ============================================================================
# Questionnaire CRUD API
# ============================================================================

@bp.route('/api/questionnaires', methods=['GET'])
def list_questionnaires():
    """List all questionnaires with optional filtering."""
    # Get filter parameters
    state = request.args.get('state')
    city = request.args.get('city')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = Questionnaire.query

    # Apply filters
    if state:
        query = query.filter(Questionnaire.state == state.upper())
    if city:
        query = query.filter(Questionnaire.city.ilike(f'%{city}%'))
    if start_date:
        query = query.filter(Questionnaire.election_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(Questionnaire.election_date <= datetime.fromisoformat(end_date))

    questionnaires = query.order_by(Questionnaire.updated_at.desc()).all()

    return jsonify({
        'questionnaires': [q.to_dict() for q in questionnaires],
        'count': len(questionnaires)
    })


@bp.route('/api/questionnaires', methods=['POST'])
def create_questionnaire():
    """Create a new questionnaire."""
    data = request.get_json()

    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400

    # Extract targeting info from the content if provided
    content = data.get('content', {'name': data['name'], 'description': '', 'races': []})

    # Auto-detect geographic targeting from races
    state = data.get('state')
    city = data.get('city')
    primary_date = data.get('primary_date')

    if not state and 'races' in content and content['races']:
        first_race = content['races'][0]
        state = first_race.get('state')
        city = first_race.get('city')
        primary_date = first_race.get('primary_date')

    # Create questionnaire
    questionnaire = Questionnaire(
        name=data['name'],
        description=data.get('description', content.get('description', '')),
        state=state,
        city=city,
        region=data.get('region'),
        primary_date=datetime.fromisoformat(primary_date).date() if primary_date else None,
        current_version=1
    )
    db.session.add(questionnaire)
    db.session.flush()  # Get the ID

    # Ensure content has required fields
    if 'name' not in content:
        content['name'] = data['name']
    if 'races' not in content:
        content['races'] = []

    # Create initial version
    version = QuestionnaireVersion(
        questionnaire_id=questionnaire.id,
        version_number=1,
        content_json=json.dumps(content, indent=2),
        change_summary='Initial creation'
    )
    db.session.add(version)

    # Log the change
    change_log = ChangeLog(
        questionnaire_id=questionnaire.id,
        version_from=None,
        version_to=1,
        change_type='create',
        change_summary='Created questionnaire',
        user_agent=request.headers.get('User-Agent'),
        ip_address=request.remote_addr
    )
    db.session.add(change_log)

    db.session.commit()

    return jsonify({
        'questionnaire': questionnaire.to_dict(),
        'content': content
    }), 201


@bp.route('/api/questionnaires/<int:id>', methods=['GET'])
def get_questionnaire(id):
    """Get a questionnaire with its current content."""
    questionnaire = Questionnaire.query.get_or_404(id)
    content = questionnaire.get_current_content()

    return jsonify({
        'questionnaire': questionnaire.to_dict(),
        'content': content
    })


@bp.route('/api/questionnaires/<int:id>', methods=['PUT'])
def update_questionnaire(id):
    """Update a questionnaire's content, creating a new version."""
    questionnaire = Questionnaire.query.get_or_404(id)
    data = request.get_json()

    if not data or 'content' not in data:
        return jsonify({'error': 'Content is required'}), 400

    content = data['content']
    change_summary = data.get('change_summary', 'Updated questionnaire')

    # Get the previous content for diff
    old_content = questionnaire.get_current_content()
    old_version = questionnaire.current_version

    # Create new version
    version = questionnaire.create_version(content, change_summary)

    # Calculate diff for change log
    diff = compute_diff(old_content, content)

    # Update questionnaire metadata if provided
    if 'name' in data:
        questionnaire.name = data['name']
    if 'description' in data:
        questionnaire.description = data['description']

    # Auto-update targeting from content
    if 'races' in content and content['races']:
        first_race = content['races'][0]
        questionnaire.state = first_race.get('state')
        questionnaire.city = first_race.get('city')
        if first_race.get('primary_date'):
            questionnaire.primary_date = datetime.fromisoformat(first_race['primary_date']).date()

    # Log the change
    change_log = ChangeLog(
        questionnaire_id=questionnaire.id,
        version_from=old_version,
        version_to=version.version_number,
        change_type='update',
        change_summary=change_summary,
        change_details=json.dumps(diff),
        user_agent=request.headers.get('User-Agent'),
        ip_address=request.remote_addr
    )
    db.session.add(change_log)

    db.session.commit()

    return jsonify({
        'questionnaire': questionnaire.to_dict(),
        'content': content,
        'version': version.to_dict()
    })


@bp.route('/api/questionnaires/<int:id>', methods=['DELETE'])
def delete_questionnaire(id):
    """Delete a questionnaire and all its versions."""
    questionnaire = Questionnaire.query.get_or_404(id)
    db.session.delete(questionnaire)
    db.session.commit()

    return jsonify({'message': 'Questionnaire deleted'})


# ============================================================================
# Version Control API
# ============================================================================

@bp.route('/api/questionnaires/<int:id>/versions', methods=['GET'])
def list_versions(id):
    """List all versions of a questionnaire."""
    questionnaire = Questionnaire.query.get_or_404(id)
    versions = questionnaire.versions.order_by(QuestionnaireVersion.version_number.desc()).all()

    return jsonify({
        'versions': [v.to_dict() for v in versions],
        'current_version': questionnaire.current_version
    })


@bp.route('/api/questionnaires/<int:id>/versions/<int:version_number>', methods=['GET'])
def get_version(id, version_number):
    """Get a specific version's content."""
    version = QuestionnaireVersion.query.filter_by(
        questionnaire_id=id,
        version_number=version_number
    ).first_or_404()

    return jsonify({
        'version': version.to_dict(),
        'content': version.get_content()
    })


@bp.route('/api/questionnaires/<int:id>/versions/<int:version_number>/rollback', methods=['POST'])
def rollback_version(id, version_number):
    """Rollback to a specific version."""
    questionnaire = Questionnaire.query.get_or_404(id)
    target_version = QuestionnaireVersion.query.filter_by(
        questionnaire_id=id,
        version_number=version_number
    ).first_or_404()

    old_version = questionnaire.current_version
    content = target_version.get_content()

    # Create a new version with the old content
    new_version = questionnaire.create_version(
        content,
        f'Rollback to version {version_number}'
    )

    # Log the change
    change_log = ChangeLog(
        questionnaire_id=questionnaire.id,
        version_from=old_version,
        version_to=new_version.version_number,
        change_type='rollback',
        change_summary=f'Rolled back to version {version_number}',
        user_agent=request.headers.get('User-Agent'),
        ip_address=request.remote_addr
    )
    db.session.add(change_log)

    db.session.commit()

    return jsonify({
        'questionnaire': questionnaire.to_dict(),
        'content': content,
        'version': new_version.to_dict()
    })


@bp.route('/api/questionnaires/<int:id>/compare', methods=['GET'])
def compare_versions(id):
    """Compare two versions of a questionnaire."""
    version_a = request.args.get('version_a', type=int)
    version_b = request.args.get('version_b', type=int)

    if not version_a or not version_b:
        return jsonify({'error': 'Both version_a and version_b are required'}), 400

    va = QuestionnaireVersion.query.filter_by(
        questionnaire_id=id,
        version_number=version_a
    ).first_or_404()

    vb = QuestionnaireVersion.query.filter_by(
        questionnaire_id=id,
        version_number=version_b
    ).first_or_404()

    diff = compute_diff(va.get_content(), vb.get_content())

    return jsonify({
        'version_a': va.to_dict(),
        'version_b': vb.to_dict(),
        'diff': diff
    })


# ============================================================================
# Change History API
# ============================================================================

@bp.route('/api/questionnaires/<int:id>/changes', methods=['GET'])
def list_changes(id):
    """List all changes for a questionnaire."""
    questionnaire = Questionnaire.query.get_or_404(id)
    changes = questionnaire.changes.order_by(ChangeLog.created_at.desc()).all()

    return jsonify({
        'changes': [c.to_dict() for c in changes]
    })


# ============================================================================
# Import/Export API
# ============================================================================

@bp.route('/api/questionnaires/<int:id>/export', methods=['GET'])
def export_questionnaire(id):
    """Export a questionnaire as JSON file."""
    questionnaire = Questionnaire.query.get_or_404(id)
    content = questionnaire.get_current_content()

    # Create a temporary file
    filename = f"{questionnaire.name.replace(' ', '_').lower()}_v{questionnaire.current_version}.json"

    return jsonify(content), 200, {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Content-Type': 'application/json'
    }


@bp.route('/api/questionnaires/<int:id>/export/file', methods=['GET'])
def export_questionnaire_file(id):
    """Export a questionnaire as downloadable JSON file."""
    questionnaire = Questionnaire.query.get_or_404(id)
    content = questionnaire.get_current_content()

    # Create a temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(content, f, indent=2)
        temp_path = f.name

    filename = f"{questionnaire.name.replace(' ', '_').lower()}_v{questionnaire.current_version}.json"

    return send_file(
        temp_path,
        mimetype='application/json',
        as_attachment=True,
        download_name=filename
    )


@bp.route('/api/questionnaires/import', methods=['POST'])
def import_questionnaire():
    """Import a questionnaire from JSON file or data."""
    if 'file' in request.files:
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        try:
            content = json.load(file)
        except json.JSONDecodeError as e:
            return jsonify({'error': f'Invalid JSON: {str(e)}'}), 400
    else:
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'No file or content provided'}), 400
        content = data['content']

    # Validate required fields
    if 'name' not in content:
        return jsonify({'error': 'JSON must have a "name" field'}), 400

    # Create the questionnaire
    return create_questionnaire_from_content(content)


def create_questionnaire_from_content(content):
    """Helper to create a questionnaire from content dict."""
    # Extract metadata
    name = content.get('name', 'Imported Questionnaire')
    description = content.get('description', '')

    # Extract targeting from first race
    state = None
    city = None
    primary_date = None

    if 'races' in content and content['races']:
        first_race = content['races'][0]
        state = first_race.get('state')
        city = first_race.get('city')
        primary_date = first_race.get('primary_date')

    questionnaire = Questionnaire(
        name=name,
        description=description,
        state=state,
        city=city,
        primary_date=datetime.fromisoformat(primary_date).date() if primary_date else None,
        current_version=1
    )
    db.session.add(questionnaire)
    db.session.flush()

    # Create initial version
    version = QuestionnaireVersion(
        questionnaire_id=questionnaire.id,
        version_number=1,
        content_json=json.dumps(content, indent=2),
        change_summary='Imported from JSON'
    )
    db.session.add(version)

    # Log the change
    change_log = ChangeLog(
        questionnaire_id=questionnaire.id,
        version_from=None,
        version_to=1,
        change_type='import',
        change_summary='Imported from JSON file',
        user_agent=request.headers.get('User-Agent'),
        ip_address=request.remote_addr
    )
    db.session.add(change_log)

    db.session.commit()

    return jsonify({
        'questionnaire': questionnaire.to_dict(),
        'content': content
    }), 201


# ============================================================================
# Crawler Integration API
# ============================================================================

@bp.route('/api/questionnaires/<int:id>/crawl', methods=['POST'])
def start_crawl(id):
    """Start the endorsement crawler for a questionnaire."""
    questionnaire = Questionnaire.query.get_or_404(id)
    content = questionnaire.get_current_content()

    # Check if there's already a running job
    running_job = CrawlJob.query.filter_by(
        questionnaire_id=id,
        status='running'
    ).first()

    if running_job:
        return jsonify({
            'error': 'A crawl job is already running for this questionnaire',
            'job': running_job.to_dict()
        }), 409

    # Create a new crawl job
    job = CrawlJob(
        questionnaire_id=id,
        version_number=questionnaire.current_version,
        status='pending'
    )
    db.session.add(job)
    db.session.commit()

    # Write content to temporary file for crawler
    base_dir = os.path.dirname(os.path.dirname(__file__))
    temp_config = os.path.join(base_dir, 'data', f'crawl_job_{job.id}.json')
    result_dir = os.path.join(base_dir, 'results', f'job_{job.id}')

    with open(temp_config, 'w') as f:
        json.dump(content, f, indent=2)

    os.makedirs(result_dir, exist_ok=True)

    # Start the crawler in background (non-blocking)
    try:
        job.status = 'running'
        job.started_at = datetime.utcnow()
        job.result_path = result_dir
        db.session.commit()

        # This would typically be run as a background task
        # For now, we'll return immediately and let the user poll for status
        subprocess.Popen(
            [
                'endorsement-crawler',
                '--config', temp_config,
                '--output', result_dir,
                '--max-pages', '20'
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    except Exception as e:
        job.status = 'failed'
        job.error_message = str(e)
        db.session.commit()
        return jsonify({'error': str(e), 'job': job.to_dict()}), 500

    return jsonify({
        'message': 'Crawl job started',
        'job': job.to_dict()
    })


@bp.route('/api/crawl-jobs/<int:job_id>', methods=['GET'])
def get_crawl_job(job_id):
    """Get the status of a crawl job."""
    job = CrawlJob.query.get_or_404(job_id)

    # Check if the job has completed by looking for result files
    if job.status == 'running' and job.result_path:
        result_files = []
        if os.path.exists(job.result_path):
            result_files = [f for f in os.listdir(job.result_path) if f.endswith('.json')]

        if result_files:
            job.status = 'completed'
            job.completed_at = datetime.utcnow()
            db.session.commit()

    return jsonify({'job': job.to_dict()})


@bp.route('/api/questionnaires/<int:id>/crawl-jobs', methods=['GET'])
def list_crawl_jobs(id):
    """List all crawl jobs for a questionnaire."""
    questionnaire = Questionnaire.query.get_or_404(id)
    jobs = questionnaire.crawl_jobs.order_by(CrawlJob.created_at.desc()).all()

    return jsonify({
        'jobs': [j.to_dict() for j in jobs]
    })


# ============================================================================
# Utility Functions
# ============================================================================

def compute_diff(old_content: dict, new_content: dict) -> dict:
    """Compute a human-readable diff between two content versions."""
    old_json = json.dumps(old_content, indent=2, sort_keys=True)
    new_json = json.dumps(new_content, indent=2, sort_keys=True)

    diff_lines = list(unified_diff(
        old_json.splitlines(keepends=True),
        new_json.splitlines(keepends=True),
        fromfile='previous',
        tofile='current'
    ))

    # Also compute structural changes
    changes = {
        'races_added': [],
        'races_removed': [],
        'races_modified': [],
        'candidates_added': [],
        'candidates_removed': [],
        'text_diff': ''.join(diff_lines)
    }

    old_races = {r.get('name'): r for r in old_content.get('races', [])}
    new_races = {r.get('name'): r for r in new_content.get('races', [])}

    # Find added races
    for name in new_races:
        if name not in old_races:
            changes['races_added'].append(name)

    # Find removed races
    for name in old_races:
        if name not in new_races:
            changes['races_removed'].append(name)

    # Find modified races
    for name in new_races:
        if name in old_races:
            if new_races[name] != old_races[name]:
                changes['races_modified'].append(name)

                # Check candidate changes
                old_candidates = {c.get('name'): c for c in old_races[name].get('candidates', [])}
                new_candidates = {c.get('name'): c for c in new_races[name].get('candidates', [])}

                for cname in new_candidates:
                    if cname not in old_candidates:
                        changes['candidates_added'].append(f"{cname} ({name})")

                for cname in old_candidates:
                    if cname not in new_candidates:
                        changes['candidates_removed'].append(f"{cname} ({name})")

    return changes


# ============================================================================
# Geographic Data API (for dropdowns)
# ============================================================================

@bp.route('/api/states', methods=['GET'])
def list_states():
    """List all unique states from questionnaires."""
    states = db.session.query(Questionnaire.state).distinct().filter(
        Questionnaire.state.isnot(None)
    ).all()

    return jsonify({
        'states': [s[0] for s in states if s[0]]
    })


@bp.route('/api/cities', methods=['GET'])
def list_cities():
    """List all unique cities from questionnaires."""
    state = request.args.get('state')

    query = db.session.query(Questionnaire.city).distinct().filter(
        Questionnaire.city.isnot(None)
    )

    if state:
        query = query.filter(Questionnaire.state == state.upper())

    cities = query.all()

    return jsonify({
        'cities': [c[0] for c in cities if c[0]]
    })
