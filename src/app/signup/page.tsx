import { redirect } from "next/navigation";

/** Public signups are disabled on the demo site — visitors use the one-click demo accounts. */
export default function SignupPage() {
  redirect("/");
}
