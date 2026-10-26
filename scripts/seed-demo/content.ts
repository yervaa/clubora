/**
 * Fictional demo dataset: 3 clubs, 13 roster members + the 2 demo accounts.
 * Names pair real first names with obviously fake surnames so nobody mistakes
 * the data for real students.
 */

import { DEMO_EMAIL_DOMAIN } from "./constants";

export type RosterSlug =
  | "avery"
  | "blake"
  | "casey"
  | "dana"
  | "ellis"
  | "frankie"
  | "gray"
  | "harper"
  | "indy"
  | "jules"
  | "kendall"
  | "logan"
  | "morgan";

/** Roster members plus the two env-configured demo accounts. */
export type PersonKey = RosterSlug | "officer" | "member";

export const ROSTER: Array<{ slug: RosterSlug; fullName: string }> = [
  { slug: "avery", fullName: "Avery Example" },
  { slug: "blake", fullName: "Blake Sample" },
  { slug: "casey", fullName: "Casey Placeholder" },
  { slug: "dana", fullName: "Dana Testwell" },
  { slug: "ellis", fullName: "Ellis Mockley" },
  { slug: "frankie", fullName: "Frankie Fakeworth" },
  { slug: "gray", fullName: "Gray Notreal" },
  { slug: "harper", fullName: "Harper Prototype" },
  { slug: "indy", fullName: "Indy Dummyson" },
  { slug: "jules", fullName: "Jules Stubbs" },
  { slug: "kendall", fullName: "Kendall Lorem" },
  { slug: "logan", fullName: "Logan Ipsum" },
  { slug: "morgan", fullName: "Morgan Fixture" },
];

export const DEMO_OFFICER_NAME = "Demo Officer";
export const DEMO_MEMBER_NAME = "Demo Member";

export function rosterEmail(fullName: string): string {
  return `${fullName.toLowerCase().replace(/\s+/g, ".")}${DEMO_EMAIL_DOMAIN}`;
}

type EventType = "Meeting" | "Workshop" | "Social" | "Competition" | "Fundraiser" | "Service" | "Other";

export type EventSpec = {
  title: string;
  description: string;
  location: string;
  type: EventType;
  /** Days from now; negative = past event (gets attendance). */
  days: number;
  capacity?: number;
};

export type MemberDuesStatus = "paid" | "unpaid" | "partial" | "exempt";

export type ClubPlan = {
  name: string;
  description: string;
  joinCode: string;
  president: RosterSlug;
  /** Roster officers in addition to the demo officer. */
  officers: RosterSlug[];
  /** Roster members in addition to the demo member. */
  members: RosterSlug[];
  announcements: Array<{ title: string; content: string; daysAgo: number; pinned?: boolean }>;
  events: EventSpec[];
  tasks: Array<{
    title: string;
    description: string;
    status: "todo" | "in_progress" | "blocked" | "completed";
    priority: "low" | "medium" | "high" | "urgent";
    dueDays: number;
    assignee: PersonKey;
  }>;
  dues: {
    title: string;
    amountCents: number;
    dueDays: number;
    /** Stripe-style payment records. People not listed have no record (= unpaid). */
    payments: Partial<Record<PersonKey, "paid" | "pending">>;
    /** Officer roster tracker. People not listed default to "unpaid". */
    tracker: Partial<Record<PersonKey, MemberDuesStatus>>;
  };
};

export const CLUB_PLANS: ClubPlan[] = [
  {
    name: "Robotics Club",
    description: "We design, build, and program robots for regional competitions. No experience needed.",
    joinCode: "DEMROB",
    president: "avery",
    officers: ["dana"],
    members: ["ellis", "frankie", "gray", "harper", "logan"],
    announcements: [
      {
        title: "Build season kickoff is Thursday",
        content: "We'll reveal this year's game and split into drivetrain, intake, and software teams. Pizza provided.",
        daysAgo: 1,
        pinned: true,
      },
      {
        title: "Safety glasses required in the shop",
        content: "Starting this week, nobody enters the build area without safety glasses. Spares are on the shelf by the door.",
        daysAgo: 5,
      },
      {
        title: "Sponsor thank-you cards",
        content: "Please sign the cards on the officer table before Friday so we can mail them out.",
        daysAgo: 12,
      },
    ],
    events: [
      { title: "Build season kickoff", description: "Game reveal and team assignments.", location: "Room 214 (Engineering lab)", type: "Meeting", days: 3 },
      { title: "CAD workshop", description: "Intro to Onshape — bring a laptop.", location: "Library computer lab", type: "Workshop", days: 8, capacity: 20 },
      { title: "Drive practice", description: "Driver tryouts on the practice field.", location: "Gym annex", type: "Meeting", days: 15 },
      { title: "Regional qualifier", description: "Bus leaves at 6:30 AM sharp.", location: "Westfield High School", type: "Competition", days: 24 },
      { title: "Parts inventory night", description: "Sort and label the spare parts bins.", location: "Room 214 (Engineering lab)", type: "Meeting", days: -6 },
      { title: "Welcome back social", description: "Meet the team and see last year's robot.", location: "Cafeteria", type: "Social", days: -14 },
    ],
    tasks: [
      { title: "Order replacement motors", description: "Two drivetrain motors burned out — get quotes from two vendors.", status: "in_progress", priority: "high", dueDays: 4, assignee: "officer" },
      { title: "Book bus for regional qualifier", description: "Confirm headcount with the activities office.", status: "todo", priority: "urgent", dueDays: 7, assignee: "dana" },
      { title: "Update team roster sheet", description: "Add new members from the welcome social.", status: "completed", priority: "low", dueDays: -3, assignee: "ellis" },
    ],
    dues: {
      title: "Fall 2026 team dues",
      amountCents: 2500,
      dueDays: 21,
      payments: { member: "paid", dana: "paid", ellis: "paid", frankie: "pending", harper: "paid" },
      tracker: { officer: "paid", member: "paid", dana: "paid", ellis: "paid", frankie: "partial", harper: "paid", logan: "exempt" },
    },
  },
  {
    name: "Debate Society",
    description: "Weekly practice rounds, tournament travel, and public forum prep for all skill levels.",
    joinCode: "DEMDEB",
    president: "blake",
    officers: ["indy"],
    members: ["jules", "kendall", "morgan", "ellis", "gray"],
    announcements: [
      {
        title: "Tournament sign-ups close Friday",
        content: "If you want a spot at the November invitational, add your name to the sign-up sheet by Friday at 5 PM.",
        daysAgo: 2,
        pinned: true,
      },
      {
        title: "New resolution posted",
        content: "This month's public forum topic is up on the board. Start your research early.",
        daysAgo: 6,
      },
      {
        title: "Judges needed",
        content: "Ask a parent or teacher if they can judge a round at our home tournament. No experience required.",
        daysAgo: 15,
      },
    ],
    events: [
      { title: "Practice rounds", description: "Two rounds of public forum. Bring your flow paper.", location: "Room 108", type: "Meeting", days: 2 },
      { title: "Research workshop", description: "How to find and cut good evidence.", location: "Library", type: "Workshop", days: 9 },
      { title: "Mock tournament", description: "Full-day practice tournament with volunteer judges.", location: "Auditorium", type: "Competition", days: 16, capacity: 30 },
      { title: "November invitational", description: "Travel tournament — permission slips required.", location: "Lakeside Prep", type: "Competition", days: 27 },
      { title: "Novice orientation", description: "Debate formats and how rounds work.", location: "Room 108", type: "Meeting", days: -4 },
      { title: "Bake sale fundraiser", description: "Raising money for tournament fees.", location: "Main lobby", type: "Fundraiser", days: -11 },
    ],
    tasks: [
      { title: "Collect permission slips", description: "Everyone travelling to the invitational needs a signed slip.", status: "todo", priority: "high", dueDays: 10, assignee: "officer" },
      { title: "Recruit volunteer judges", description: "We need at least eight judges for the mock tournament.", status: "in_progress", priority: "medium", dueDays: 12, assignee: "indy" },
      { title: "Deposit bake sale cash", description: "Count the cash box and deposit at the front office.", status: "blocked", priority: "medium", dueDays: -1, assignee: "jules" },
    ],
    dues: {
      title: "Fall 2026 tournament fee",
      amountCents: 1500,
      dueDays: 14,
      payments: { indy: "paid", jules: "paid", kendall: "pending", morgan: "paid" },
      tracker: { officer: "paid", indy: "paid", jules: "paid", kendall: "unpaid", morgan: "paid", gray: "exempt" },
    },
  },
  {
    name: "Photography Club",
    description: "Photo walks, editing nights, and a spring gallery show. Phones and cameras both welcome.",
    joinCode: "DEMPHO",
    president: "casey",
    officers: ["harper"],
    members: ["frankie", "kendall", "logan", "morgan", "jules"],
    announcements: [
      {
        title: "Photo walk this Saturday",
        content: "We're meeting at the park entrance at 9 AM. Theme: autumn colors.",
        daysAgo: 1,
        pinned: true,
      },
      {
        title: "Gallery show submissions open",
        content: "Submit up to three prints for the spring show. Details on the Events page.",
        daysAgo: 8,
      },
      {
        title: "Borrowable cameras",
        content: "Two club cameras are available to borrow for a week at a time. Ask an officer.",
        daysAgo: 20,
      },
    ],
    events: [
      { title: "Autumn photo walk", description: "Theme: autumn colors.", location: "Riverside Park entrance", type: "Social", days: 5 },
      { title: "Editing night", description: "Lightroom basics and critique.", location: "Art room 3", type: "Workshop", days: 12 },
      { title: "Portrait session", description: "Practice lighting with volunteer models.", location: "Black box theater", type: "Workshop", days: 19, capacity: 15 },
      { title: "Community service shoot", description: "Photos for the food bank's newsletter.", location: "Downtown food bank", type: "Service", days: 26 },
      { title: "Composition basics", description: "Rule of thirds, leading lines, framing.", location: "Art room 3", type: "Workshop", days: -7 },
      { title: "Club interest meeting", description: "Plans for the year and officer intros.", location: "Art room 3", type: "Meeting", days: -16 },
    ],
    tasks: [
      { title: "Reserve gallery wall space", description: "Talk to the art department about April dates.", status: "todo", priority: "medium", dueDays: 14, assignee: "harper" },
      { title: "Print flyers for photo walk", description: "20 copies, post near the main stairwell.", status: "completed", priority: "low", dueDays: -2, assignee: "officer" },
      { title: "Clean camera sensors", description: "Both club cameras before they're lent out again.", status: "todo", priority: "low", dueDays: 9, assignee: "logan" },
    ],
    dues: {
      title: "Fall 2026 club dues",
      amountCents: 2000,
      dueDays: 28,
      payments: { harper: "paid", frankie: "paid", morgan: "pending", jules: "paid" },
      tracker: { officer: "paid", member: "unpaid", harper: "paid", frankie: "paid", morgan: "partial", jules: "paid", logan: "unpaid" },
    },
  },
];
