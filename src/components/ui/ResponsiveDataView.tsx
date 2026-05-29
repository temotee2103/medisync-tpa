"use client";

import React from "react";

type ResponsiveDataViewProps = {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
};

export function ResponsiveDataView({
  desktop,
  mobile,
  className,
  desktopClassName,
  mobileClassName,
}: ResponsiveDataViewProps) {
  return (
    <div className={className}>
      <div className={desktopClassName ?? "hidden lg:block"}>{desktop}</div>
      <div className={mobileClassName ?? "lg:hidden"}>{mobile}</div>
    </div>
  );
}
