import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    buildTime: new Date().toISOString(),
    version: "b38a5fa-gmail-open-redirect",
    message: "If you see this, the latest deployment is working",
  });
}
