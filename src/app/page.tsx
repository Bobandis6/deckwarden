import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">Deckwarden</h1>
      <p className="text-muted-foreground max-w-md text-center text-lg">
        A deck builder for Magic: The Gathering and beyond. Under construction.
      </p>
      <Button render={<a href="https://github.com/Bobandis6/deckwarden" />}>
        Follow the build
      </Button>
    </main>
  );
}
