"""Tests for the player-bio source: pure transform + DB update semantics."""

from __future__ import annotations

import uuid

import pytest

from etl.sources.players_bio import BioRow, transform_people, upsert_bio


def test_transform_maps_bio_fields():
    payload = {
        "people": [
            {
                "id": 691907,
                "primaryPosition": {"abbreviation": "SS"},
                "batSide": {"code": "L"},
                "pitchHand": {"code": "R"},
                "birthDate": "2001-07-26",
            }
        ]
    }
    (row,) = transform_people(payload)
    assert row == BioRow(691907, "SS", "L", "R", "2001-07-26")


def test_transform_tolerates_missing_and_invalid_fields():
    payload = {
        "people": [
            {"id": 1},  # nothing but id
            {"id": 2, "batSide": {"code": "?"}, "primaryPosition": {}},
        ]
    }
    rows = {r.player_id: r for r in transform_people(payload)}
    assert rows[1] == BioRow(1, None, None, None, None)
    assert rows[2].bats is None  # invalid code dropped
    assert rows[2].primary_position is None


@pytest.mark.db
def test_upsert_bio_updates_bio_but_preserves_whitelist_columns(db_conn):
    pid = 970000 + (uuid.uuid4().int % 1000)
    try:
        # Seed a tracked player as the Node whitelist would, with a manual name_zh.
        with db_conn.cursor() as cur:
            cur.execute(
                """
                insert into players
                    (mlb_player_id, name_en, name_zh, primary_position, lifecycle)
                values (%s, 'Test Player', '測試球員', 'P', 'tracked')
                """,
                (pid,),
            )
        db_conn.commit()

        updated = upsert_bio(
            db_conn, [BioRow(pid, "SS", "L", "R", "2000-01-01")]
        )
        db_conn.commit()
        assert updated == 1

        with db_conn.cursor() as cur:
            cur.execute(
                """
                select primary_position, bats, throws, birthdate::text,
                       name_en, name_zh, lifecycle
                from players where mlb_player_id = %s
                """,
                (pid,),
            )
            row = cur.fetchone()
        # bio refreshed …
        assert row[:4] == ("SS", "L", "R", "2000-01-01")
        # … whitelist-owned columns untouched
        assert row[4:] == ("Test Player", "測試球員", "tracked")
    finally:
        with db_conn.cursor() as cur:
            cur.execute("delete from players where mlb_player_id = %s", (pid,))
        db_conn.commit()


@pytest.mark.db
def test_upsert_bio_ignores_unknown_players(db_conn):
    ghost = 979999999
    assert upsert_bio(db_conn, [BioRow(ghost, "P", "R", "R", None)]) == 0
