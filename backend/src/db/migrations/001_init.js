// Esquema inicial. Timestamps como milisegundos epoch (bigInteger) y fechas locales como
// 'YYYY-MM-DD' (string): así SQLite y MySQL guardan y devuelven exactamente lo mismo.

export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('nombre', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 120).notNullable();
    t.string('timezone', 64).notNullable().defaultTo('America/Argentina/Buenos_Aires');
    t.integer('work_min').notNullable().defaultTo(90);
    t.integer('break_min').notNullable().defaultTo(20);
    t.decimal('valor_hora', 12, 2).notNullable().defaultTo(0);
    t.string('moneda', 8).notNullable().defaultTo('USD');
    t.integer('min_por_distraccion').notNullable().defaultTo(5);
    t.integer('objetivo_semanal').notNullable().defaultTo(5);
    t.string('modo_cierre', 16).notNullable().defaultTo('simple');
    t.text('ajuste_pendiente');
    t.boolean('ajuste_entregado').notNullable().defaultTo(true);
    t.integer('cierres_base').notNullable().defaultTo(0); // cierres traídos por importación de estado
    t.string('ultimo_cierre_base', 10);
    t.bigInteger('created_at').notNullable();
  });

  await knex.schema.createTable('task_types', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('nombre', 60).notNullable();
    t.string('color', 16).notNullable().defaultTo('#111111');
    t.boolean('archivado').notNullable().defaultTo(false);
    t.unique(['user_id', 'nombre']);
  });

  await knex.schema.createTable('tasks', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.integer('type_id').unsigned().references('task_types.id').onDelete('SET NULL');
    t.string('titulo', 200).notNullable();
    t.text('notas');
    t.integer('estimado_min');
    t.string('estado', 16).notNullable().defaultTo('pendiente');
    t.integer('veces_movida').notNullable().defaultTo(0);
    t.bigInteger('completada_at');
    t.bigInteger('created_at').notNullable();
    t.index(['user_id', 'estado']);
  });

  await knex.schema.createTable('templates', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('nombre', 80).notNullable();
    t.integer('work_min').notNullable();
    t.integer('break_min').notNullable();
    t.integer('type_id').unsigned().references('task_types.id').onDelete('SET NULL');
    t.boolean('archivada').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('template_items', (t) => {
    t.increments('id');
    t.integer('template_id').unsigned().notNullable().references('templates.id').onDelete('CASCADE');
    t.string('texto', 200).notNullable();
    t.integer('posicion').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('dw_sessions', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('fecha', 10).notNullable();
    t.integer('posicion').notNullable().defaultTo(0);
    t.integer('template_id').unsigned().references('templates.id').onDelete('SET NULL');
    t.integer('task_id').unsigned().references('tasks.id').onDelete('SET NULL');
    t.integer('work_min_plan').notNullable();
    t.integer('break_min_plan').notNullable();
    t.string('estado', 24).notNullable().defaultTo('planificada');
    t.text('postit_objetivo');
    t.integer('postit_estimado_min');
    t.text('ajuste_mostrado');
    t.bigInteger('started_at');
    t.bigInteger('pause_started_at');
    t.bigInteger('paused_ms').notNullable().defaultTo(0);
    t.bigInteger('work_ended_at');
    t.bigInteger('break_started_at');
    t.bigInteger('break_ended_at');
    t.boolean('sesion_completada');
    t.string('tarea_completada', 8);
    t.text('resumen');
    t.decimal('real_min', 8, 1);
    t.bigInteger('closed_at');
    t.index(['user_id', 'fecha']);
    t.index(['user_id', 'estado']);
  });

  await knex.schema.createTable('session_checklist', (t) => {
    t.increments('id');
    t.integer('session_id').unsigned().notNullable().references('dw_sessions.id').onDelete('CASCADE');
    t.string('texto', 200).notNullable();
    t.boolean('hecho').notNullable().defaultTo(false);
    t.integer('posicion').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('session_objectives', (t) => {
    t.increments('id');
    t.integer('session_id').unsigned().notNullable().references('dw_sessions.id').onDelete('CASCADE');
    t.string('texto', 300).notNullable();
    t.boolean('logrado').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('distractions', (t) => {
    t.increments('id');
    t.integer('session_id').unsigned().notNullable().references('dw_sessions.id').onDelete('CASCADE');
    t.bigInteger('at').notNullable();
    t.decimal('minuto', 8, 1).notNullable();
    t.string('nota', 300);
    t.integer('duracion_s');
  });

  await knex.schema.createTable('metrics', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('nombre', 60).notNullable();
    t.string('tipo', 12).notNullable(); // escala | sino | numero | texto
    t.string('clave', 24); // distracciones | energia | null
    t.boolean('activa').notNullable().defaultTo(true);
    t.integer('posicion').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('metric_values', (t) => {
    t.increments('id');
    t.integer('session_id').unsigned().notNullable().references('dw_sessions.id').onDelete('CASCADE');
    t.integer('metric_id').unsigned().notNullable().references('metrics.id').onDelete('CASCADE');
    t.string('valor', 500);
    t.unique(['session_id', 'metric_id']);
  });

  await knex.schema.createTable('bank_questions', (t) => {
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('id', 8).notNullable();
    t.string('tema', 2).notNullable();
    t.string('subvariable', 60).notNullable();
    t.string('modo', 4).notNullable();
    t.text('texto').notNullable();
    t.string('problema_si', 8).notNullable();
    t.string('por_que', 200);
    t.string('na_auto', 24);
    t.string('dato', 32);
    t.boolean('ritual').notNullable().defaultTo(false);
    t.boolean('activa').notNullable().defaultTo(true);
    t.string('origen', 16).notNullable().defaultTo('banco');
    t.primary(['user_id', 'id']);
  });

  await knex.schema.createTable('closures', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.integer('session_id').unsigned().references('dw_sessions.id').onDelete('SET NULL');
    t.integer('numero');
    t.string('fecha_local', 10).notNullable();
    t.integer('sesion_del_dia').notNullable();
    t.string('estado', 12).notNullable().defaultTo('borrador');
    t.text('avisos');
    t.text('por_que');
    t.text('ajuste');
    t.decimal('ratio', 6, 2);
    t.bigInteger('created_at').notNullable();
    t.bigInteger('confirmed_at');
    t.index(['user_id', 'estado']);
  });

  await knex.schema.createTable('closure_items', (t) => {
    t.increments('id');
    t.integer('closure_id').unsigned().notNullable().references('closures.id').onDelete('CASCADE');
    t.string('tema', 2).notNullable();
    t.string('question_id', 8);
    t.integer('posicion').notNullable();
    t.string('respuesta', 4);
    t.text('dato_json');
    t.boolean('problema');
    t.boolean('na_automatico').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('bank_theme_state', (t) => {
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('tema', 2).notNullable();
    t.text('usados_ciclo').notNullable();
    t.string('ultimo_modo', 4);
    t.primary(['user_id', 'tema']);
  });

  await knex.schema.createTable('question_stats', (t) => {
    t.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('question_id', 8).notNullable();
    t.integer('apariciones').notNullable().defaultTo(0);
    t.integer('aplicables').notNullable().defaultTo(0);
    t.integer('problemas').notNullable().defaultTo(0);
    t.integer('na').notNullable().defaultTo(0);
    t.primary(['user_id', 'question_id']);
  });
}

export async function down(knex) {
  for (const t of [
    'question_stats', 'bank_theme_state', 'closure_items', 'closures', 'bank_questions',
    'metric_values', 'metrics', 'distractions', 'session_objectives', 'session_checklist',
    'dw_sessions', 'template_items', 'templates', 'tasks', 'task_types', 'users',
  ]) {
    await knex.schema.dropTableIfExists(t);
  }
}
