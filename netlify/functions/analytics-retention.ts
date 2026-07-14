import { purgeExpiredAnalytics } from "./_shared/analytics-store";

export default async () => {
  const result = await purgeExpiredAnalytics();
  console.info("Analytics retention cleanup completed", result);
  return new Response(null, { status: 204 });
};

export const config = {
  schedule: "17 * * * *"
};
