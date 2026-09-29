"""What a run will spend, in the units that actually stop it.

On a paid account the question is dollars and `--max-cost` answers it (CLAUDE.md §7.8). On a **free
tier** dollars are the wrong unit: nothing stops when a run costs thirty cents, and everything stops
when the month's characters run out. So a dry run reports both — the cost, and the **units against
the allowance** — because "you have 4,000 characters left this month" is the sentence that changes a
decision and "$0.30" is not.

**The allowances below are the ones the owner's accounts actually have**, read from the vendors'
pages on 2026-09-29, and each says what it is denominated in. Two of them are dollar credits, which
convert to minutes only through a rate; one is a character quota, which does not convert at all.

**Where a vendor publishes two figures that disagree, the smaller is recorded.** ElevenLabs' API
page says a Starter plan's $6 buys 150,000 characters at the Flash rate, while their web-app credit
table says Starter includes 30,000 credits at one credit per character. Nobody outside their billing
system can tell which balance an API call draws down, so this file assumes **30,000** — the same
direction as rounding a billed second up, and for the same reason: an allowance we understate costs
us a conversation, and one we overstate costs a run halfway through.
"""

from dataclasses import dataclass
from typing import Literal

AllowanceUnit = Literal["micro_usd", "characters"]


@dataclass(frozen=True)
class Allowance:
    """What a free tier gives, in its own unit."""

    provider: str
    plan: str
    unit: AllowanceUnit
    amount: int
    checked: str
    note: str


#: Per month unless the note says otherwise. A credit that is granted once on signup says so,
#: because a monthly figure and a one-off figure are not the same planning problem.
ALLOWANCES: dict[str, Allowance] = {
    "deepgram": Allowance(
        provider="deepgram",
        plan="pay-as-you-go",
        unit="micro_usd",
        amount=200_000_000,  # $200
        checked="2026-09-29",
        note="$200 of credit granted once on signup, not monthly.",
    ),
    "assemblyai": Allowance(
        provider="assemblyai",
        plan="pay-as-you-go",
        unit="micro_usd",
        amount=50_000_000,  # $50
        checked="2026-09-29",
        note="$50 of credit granted once on signup, not monthly.",
    ),
    "elevenlabs": Allowance(
        provider="elevenlabs",
        plan="starter",
        unit="characters",
        amount=30_000,
        checked="2026-09-29",
        note=(
            "Per month. The conservative of their two published figures: their API page implies "
            "150,000 characters at the Flash rate for a $6 balance, their credit table says 30,000 "
            "credits at 1 credit per character."
        ),
    ),
    "intron": Allowance(
        provider="intron",
        plan="unknown",
        unit="micro_usd",
        amount=0,
        checked="2026-09-29",
        note="They publish no pricing and no free-tier figure. Nothing may be assumed.",
    ),
}


@dataclass(frozen=True)
class Spend:
    """What one provider is about to be asked for, and how that sits against its allowance."""

    provider: str
    #: Audio seconds for a recogniser, characters for a synthesizer.
    units: int
    unit_name: str
    cost_micro_usd: int
    priced: bool

    def against(self, allowance: Allowance | None) -> str:
        """One line a person can act on. Never a bare percentage: the denominator is the point."""
        if allowance is None or allowance.amount == 0:
            return "allowance unknown"
        if allowance.unit == "characters":
            share = self.units / allowance.amount
            return f"{self.units:,} of {allowance.amount:,} characters ({share:.1%})"
        share = self.cost_micro_usd / allowance.amount
        return (
            f"{_dollars(self.cost_micro_usd)} of {_dollars(allowance.amount)} credit ({share:.1%})"
        )


def allowance_for(provider: str) -> Allowance | None:
    return ALLOWANCES.get(provider)


def _dollars(micro_usd: int) -> str:
    return f"${micro_usd / 1_000_000:,.2f}"
