import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { TodoService } from './todo.service';

/** 할 일 목록(TO DO LIST). 조직은 세션에서만 온다. */
@Controller('todo')
export class TodoController {
  constructor(private readonly todo: TodoService) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.todo.list(organizationId);
  }

  @Post()
  create(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    return this.todo.create(organizationId, body);
  }

  /** 여러 줄을 한 번에 넣는다(같은 묶음 · 같은 제목은 건너뛴다). */
  @Post('seed')
  seed(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    return this.todo.seed(organizationId, body);
  }

  @Patch(':todoId')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('todoId', new ParseUUIDPipe()) todoId: string,
    @Body() body: unknown,
  ) {
    return this.todo.update(organizationId, todoId, body);
  }

  @Delete(':todoId')
  remove(
    @CurrentOrganization() organizationId: string,
    @Param('todoId', new ParseUUIDPipe()) todoId: string,
  ) {
    return this.todo.remove(organizationId, todoId);
  }
}
