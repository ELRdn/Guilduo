// Run the same interaction and motion acceptance on the official documents.
process.argv[3] = "official";
await import("./verify-lpv21.mts");
export {};
