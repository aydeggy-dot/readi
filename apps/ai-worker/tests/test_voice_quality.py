"""The connection summary, and the rule that decides when voice stops being worth it."""

from datetime import UTC, datetime, timedelta

from readi_worker.voice.quality import FALLBACK_AFTER_POOR_MS, QualityMonitor


class ManualClock:
    """A clock a test moves. Monotonic and wall clock advance together, as they do in life."""

    def __init__(self) -> None:
        self._seconds = 1_000.0

    def advance(self, seconds: float) -> None:
        self._seconds += seconds

    def now(self) -> datetime:
        return datetime(2026, 9, 30, 10, tzinfo=UTC) + timedelta(seconds=self._seconds - 1_000.0)

    def monotonic(self) -> float:
        return self._seconds


def test_a_leg_with_no_samples_reports_nulls_rather_than_zeroes() -> None:
    # A zero p95 in an average is worse than no p95: it says the connection was perfect.
    summary = QualityMonitor(ManualClock()).summary()
    assert summary.rtt_ms_p50 is None
    assert summary.rtt_ms_p95 is None
    assert summary.packet_loss_percent is None
    assert summary.reconnects == 0


def test_percentiles_are_nearest_rank() -> None:
    monitor = QualityMonitor(ManualClock())
    for rtt in (80, 90, 100, 110, 400):
        monitor.note(rtt_ms=rtt)
    summary = monitor.summary()
    assert summary.rtt_ms_p50 is not None
    assert summary.rtt_ms_p50.root == 100
    assert summary.rtt_ms_p95 is not None
    assert summary.rtt_ms_p95.root == 400


def test_loss_is_averaged_and_clamped() -> None:
    monitor = QualityMonitor(ManualClock())
    monitor.note(packet_loss_percent=2.0)
    monitor.note(packet_loss_percent=140.0)
    summary = monitor.summary()
    assert summary.packet_loss_percent is not None
    assert summary.packet_loss_percent.root == 51.0


def test_reconnects_are_counted_not_acted_on() -> None:
    monitor = QualityMonitor(ManualClock())
    monitor.note_reconnect()
    monitor.note_reconnect()
    assert monitor.should_fall_back is False
    assert monitor.summary().reconnects == 2


def test_one_bad_second_is_ordinary_and_does_not_fall_back() -> None:
    clock = ManualClock()
    monitor = QualityMonitor(clock)
    monitor.note(poor=True)
    clock.advance(1.0)
    assert monitor.should_fall_back is False


def test_sustained_poor_falls_back() -> None:
    clock = ManualClock()
    monitor = QualityMonitor(clock)
    monitor.note(poor=True)
    clock.advance(FALLBACK_AFTER_POOR_MS / 1_000)
    assert monitor.should_fall_back is True


def test_recovering_restarts_the_clock() -> None:
    clock = ManualClock()
    monitor = QualityMonitor(clock)
    monitor.note(poor=True)
    clock.advance(15.0)
    monitor.note(poor=False)
    clock.advance(15.0)
    assert monitor.should_fall_back is False
    monitor.note(poor=True)
    clock.advance(5.0)
    assert monitor.should_fall_back is False


def test_a_second_poor_sample_does_not_restart_the_clock() -> None:
    # The rule is how long it has been bad, not how many samples said so.
    clock = ManualClock()
    monitor = QualityMonitor(clock)
    monitor.note(poor=True)
    clock.advance(19.0)
    monitor.note(poor=True)
    clock.advance(2.0)
    assert monitor.should_fall_back is True


def test_a_reconnect_clears_the_poor_clock() -> None:
    # A reconnect is a new connection: judging it on how bad the old one was would drop a candidate
    # out of voice the moment LiveKit had put them back.
    clock = ManualClock()
    monitor = QualityMonitor(clock)
    monitor.note(poor=True)
    clock.advance(19.0)
    monitor.note_reconnect()
    clock.advance(2.0)
    assert monitor.should_fall_back is False
