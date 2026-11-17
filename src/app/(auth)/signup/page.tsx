import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  if (await getViewer()) redirect("/dossier");
  const { code } = await searchParams;

  return (
    <Page
      narrow
      title="Create your account"
      intro="The Grand Strategist is invite-only during the pilot. You need the invite code from your invitation email."
    >
      <SignUpForm initialCode={typeof code === "string" ? code : ""} />
      <p className="text-lg">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          Sign in
        </Link>
      </p>
    </Page>
  );
}
