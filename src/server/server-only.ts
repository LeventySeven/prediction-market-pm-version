if (typeof window !== "undefined") {
  throw new Error("server-only module imported in a client runtime");
}

export {};
