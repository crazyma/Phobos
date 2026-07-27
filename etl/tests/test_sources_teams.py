"""Tests for the teams source: pure transform + DB upsert (FK ordering)."""

from __future__ import annotations

import uuid

import pytest

from etl.sources.teams import TeamRow, transform_teams, upsert_teams


def test_transform_maps_level_from_sport_id():
    payload = {
        "teams": [
            {
                "id": 133,
                "name": "Athletics",
                "abbreviation": "ATH",
                "sport": {"id": 1},
            },
            {
                "id": 237,
                "name": "Las Vegas Aviators",
                "abbreviation": "LV",
                "sport": {"id": 11},
                "parentOrgId": 133,
            },
        ]
    }
    rows = transform_teams(payload, default_level="mlb")
    by_id = {r.mlb_team_id: r for r in rows}

    assert by_id[133].level == "mlb"
    assert by_id[133].parent_org_team_id is None
    assert by_id[237].level == "aaa"
    assert by_id[237].parent_org_team_id == 133


def test_transform_falls_back_to_default_level_and_drops_incomplete():
    payload = {
        "teams": [
            {"id": 500, "name": "No Sport Node"},  # uses default_level
            {"id": None, "name": "Missing id"},  # dropped
            {"id": 501},  # missing name → dropped
        ]
    }
    rows = transform_teams(payload, default_level="aa")
    assert [(r.mlb_team_id, r.level) for r in rows] == [(500, "aa")]


def test_transform_drops_self_parent():
    payload = {
        "teams": [
            {"id": 147, "name": "Yankees", "sport": {"id": 1}, "parentOrgId": 147}
        ]
    }
    assert transform_teams(payload, default_level="mlb")[0].parent_org_team_id is None


@pytest.mark.db
def test_upsert_orders_parents_before_children_and_is_idempotent(db_conn):
    # Unique ids outside any real range so we never collide with real teams.
    mlb_id = 990100 + (uuid.uuid4().int % 100)
    aaa_id = mlb_id + 500
    rows = [
        # child listed first on purpose — upsert must reorder mlb-first
        TeamRow(aaa_id, "Test Affiliate", "TAF", "aaa", mlb_id),
        TeamRow(mlb_id, "Test Parent", "TPR", "mlb", None),
    ]
    try:
        assert upsert_teams(db_conn, rows) == 2
        db_conn.commit()
        # second upsert (name changed) is idempotent on the key
        rows2 = [TeamRow(mlb_id, "Test Parent Renamed", "TPR", "mlb", None)]
        upsert_teams(db_conn, rows2)
        db_conn.commit()

        with db_conn.cursor() as cur:
            cur.execute(
                "select name_en, parent_org_team_id from teams where mlb_team_id = %s",
                (mlb_id,),
            )
            assert cur.fetchone() == ("Test Parent Renamed", None)
            cur.execute(
                "select parent_org_team_id from teams where mlb_team_id = %s",
                (aaa_id,),
            )
            assert cur.fetchone()[0] == mlb_id
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "delete from teams where mlb_team_id in (%s, %s)", (aaa_id, mlb_id)
            )
        db_conn.commit()
