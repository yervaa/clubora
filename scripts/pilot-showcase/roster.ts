import {
  DEFAULT_PILOT2_EMAIL,
  DEFAULT_PILOT2_PASSWORD,
  DEFAULT_PILOT_EMAIL,
  DEFAULT_PILOT_PASSWORD,
  DEFAULT_ROSTER_PASSWORD,
} from "./constants";

export type RosterSlug =
  | "pilot"
  | "pilot2"
  | "elena"
  | "marcus"
  | "james"
  | "priya"
  | "sophie"
  | "tessa"
  | "diego";

export type RosterEntry = {
  slug: RosterSlug;
  email: string;
  password: string;
  fullName: string;
};

/** Fixed roster (pilot / pilot2 / roster password all overridable via env in run.ts). */
export function buildRoster(
  pilotEmail: string,
  pilotPassword: string,
  pilot2Email: string,
  pilot2Password: string,
  rosterPassword: string = DEFAULT_ROSTER_PASSWORD,
): RosterEntry[] {
  return [
    { slug: "pilot", email: pilotEmail, password: pilotPassword, fullName: "Jordan Park" },
    { slug: "pilot2", email: pilot2Email, password: pilot2Password, fullName: "Alex Rivera" },
    { slug: "elena", email: "showcase.elena@clubora.local", password: rosterPassword, fullName: "Elena Okonkwo" },
    { slug: "marcus", email: "showcase.marcus@clubora.local", password: rosterPassword, fullName: "Marcus Chen" },
    { slug: "james", email: "showcase.james@clubora.local", password: rosterPassword, fullName: "James Rivera" },
    { slug: "priya", email: "showcase.priya@clubora.local", password: rosterPassword, fullName: "Priya Nair" },
    { slug: "sophie", email: "showcase.sophie@clubora.local", password: rosterPassword, fullName: "Sophie Brennan" },
    { slug: "tessa", email: "showcase.tessa@clubora.local", password: rosterPassword, fullName: "Tessa Morales" },
    { slug: "diego", email: "showcase.diego@clubora.local", password: rosterPassword, fullName: "Diego Alvarez" },
  ];
}

export { DEFAULT_PILOT2_EMAIL, DEFAULT_PILOT2_PASSWORD, DEFAULT_PILOT_EMAIL, DEFAULT_PILOT_PASSWORD };
