from radar.config import Kanal


def test_tier_a_mappt_auf_9():
    k = Kanal(handle="@x", tier="A")
    assert k.vertrauens_score == 9.0
    assert k.name == "x"  # Name aus Handle abgeleitet


def test_tier_b_mappt_auf_6():
    assert Kanal(handle="@y", tier="b").vertrauens_score == 6.0  # case-insensitive


def test_expliziter_score_schlaegt_tier():
    k = Kanal(handle="@z", tier="A", vertrauens_score=3)
    assert k.vertrauens_score == 3.0


def test_ohne_tier_default_score():
    assert Kanal(handle="@q").vertrauens_score == 5.0


def test_expliziter_name_bleibt():
    assert Kanal(handle="@a", name="Echter Name").name == "Echter Name"
