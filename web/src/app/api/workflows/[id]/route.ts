import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ 
    success: true, 
    data: { id: params.id, message: 'Workflow detail endpoint' }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    return NextResponse.json({ 
      success: true, 
      data: { id: params.id, ...body, updatedAt: new Date().toISOString() }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, message: `Workflow ${params.id} deleted` });
}
