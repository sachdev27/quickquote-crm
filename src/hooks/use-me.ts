import { useQuery } from "@tanstack/react-query";
import { whoami } from "@/data/api";

// Signed-in user and role. Treated as non-admin until known, so admin UI never flashes for others.
export function useMe() {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => whoami(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { email: data?.email ?? "", role: data?.role, isAdmin: data?.role === "admin" };
}
