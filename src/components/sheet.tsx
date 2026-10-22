import * as React from "react";
import { useIsDesktop } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer as VDrawer,
  DrawerContent as VContent,
  DrawerHeader as VHeader,
  DrawerTitle as VTitle,
} from "@/components/ui/drawer";

// Same API as the drawer, but a centred dialog on desktop and a bottom sheet on phones.
const DesktopCtx = React.createContext(false);

export function Drawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  const desktop = useIsDesktop();
  return (
    <DesktopCtx.Provider value={desktop}>
      {desktop ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      ) : (
        <VDrawer open={open} onOpenChange={onOpenChange}>
          {children}
        </VDrawer>
      )}
    </DesktopCtx.Provider>
  );
}

export function DrawerContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return React.useContext(DesktopCtx) ? (
    <DialogContent
      className={cn(
        "flex max-h-[88vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 pt-2 sm:max-w-3xl",
        className,
      )}
    >
      {children}
    </DialogContent>
  ) : (
    <VContent className={className}>{children}</VContent>
  );
}

export function DrawerHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return React.useContext(DesktopCtx) ? (
    <DialogHeader className={cn("p-4 pb-2 text-left", className)}>{children}</DialogHeader>
  ) : (
    <VHeader className={className}>{children}</VHeader>
  );
}

export function DrawerTitle({ children }: { children: React.ReactNode }) {
  return React.useContext(DesktopCtx) ? (
    <DialogTitle>{children}</DialogTitle>
  ) : (
    <VTitle>{children}</VTitle>
  );
}
