import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo (replace with SQLite in production)
const workflows: any[] = [];

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    data: workflows,
    count: workflows.length 
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflow = {
      id: `wf-${Date.now()}`,
      ...body,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    workflows.push(workflow);
    return NextResponse.json({ success: true, data: workflow }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }
}
