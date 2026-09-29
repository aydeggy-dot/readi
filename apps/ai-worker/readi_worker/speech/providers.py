"""Which speech providers this build can construct.

One frozenset per side, read by `Settings` (so a typo in `STT_PROVIDER` is refused at startup with
the list of what is available) and by `speech/factory.py` (so there is one answer to "what exists").
A provider added in M5 phase 2 is one name here, one branch in the factory, and one price.

They are names rather than a `Literal` because the shortlist is not settled: ADR-0020 says the
provider is chosen on real recordings in phase 6, and a type that had to be edited to try a
candidate would be a type doing procurement.
"""

STT_PROVIDERS = frozenset({"fake"})
TTS_PROVIDERS = frozenset({"fake"})
