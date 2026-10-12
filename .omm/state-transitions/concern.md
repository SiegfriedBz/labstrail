A request whose run fails stays pending until a later run picks it up; until the reconciler exists (ADR 0020), nothing restarts it on its own, and past 24 hours it can only be cancelled expired.
