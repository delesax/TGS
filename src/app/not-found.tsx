import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">We could not find that page</h1>
      <p className="text-xl text-muted-foreground">The link may be out of date or mistyped.</p>
      <Button asChild className="self-start">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
