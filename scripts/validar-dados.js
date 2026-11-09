/**
 * validar-dados.js — Validação de integridade dos arquivos data/*.json
 *
 * Roda checagens de consistência entre config.json, participants.json,
 * escalas.json e missas-especiais.json (referências cruzadas de IDs).
 *
 * Uso: node scripts/validar-dados.js
 *
 * Acólitos & Coroinhas — Sistema de Gerenciamento de Escalas
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Carregamento ──────────────────────────────────────────────────

function loadJSON(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// ── Utilitários ───────────────────────────────────────────────────

/** Registra um problema encontrado, com contexto de onde apareceu. */
function reportProblem(problems, message) {
  problems.push(message);
  console.log(`  ❌ ${message}`);
}

function reportOk(message) {
  console.log(`  ✔ ${message}`);
}

// ── Checagem a: IDs de participantes únicos ─────────────────────────

function checkUniqueParticipantIds(participants, problems) {
  console.log('\n[a] IDs de participantes únicos');

  const seen = new Map(); // id -> [nomes]
  for (const p of participants) {
    if (!seen.has(p.id)) seen.set(p.id, []);
    seen.get(p.id).push(p.name);
  }

  let foundDuplicate = false;
  for (const [id, names] of seen) {
    if (names.length > 1) {
      foundDuplicate = true;
      reportProblem(problems, `id ${id} duplicado entre: ${names.join(', ')}`);
    }
  }

  if (!foundDuplicate) reportOk(`Todos os ${participants.length} IDs de participantes são únicos.`);
}

// ── Checagem b: fixedParticipants referenciam participantes existentes ──

function checkFixedParticipantsExist(config, participants, problems) {
  console.log('\n[b] Referências de fixedParticipants existem em participants.json');

  const validIds = new Set(participants.map(p => p.id));
  const fixedParticipants = config?.scheduleSettings?.fixedParticipants ?? {};

  let foundMissing = false;
  for (const [massId, ids] of Object.entries(fixedParticipants)) {
    for (const id of ids) {
      if (!validIds.has(id)) {
        foundMissing = true;
        reportProblem(problems, `fixedParticipants['${massId}'] referencia id ${id}, que não existe em participants.json`);
      }
    }
  }

  if (!foundMissing) reportOk('Todos os IDs em fixedParticipants existem em participants.json.');
}

// ── Checagem c: massId referenciados são válidos ─────────────────────

function checkMassIdReferences(config, participants, escalas, missasEspeciais, problems) {
  console.log('\n[c] Referências de massId são válidas');

  const validMassIds = new Set((config?.masses ?? []).map(m => m.id));
  let foundInvalid = false;

  function checkMassId(massId, where) {
    if (massId && !validMassIds.has(massId)) {
      foundInvalid = true;
      reportProblem(problems, `massId '${massId}' inválido — encontrado em ${where}`);
    }
  }

  const settings = config?.scheduleSettings ?? {};

  for (const massId of Object.keys(settings.participantsPerMass?.byMassId ?? {})) {
    checkMassId(massId, 'config.json scheduleSettings.participantsPerMass.byMassId');
  }
  for (const massId of Object.keys(settings.minByMassId ?? {})) {
    checkMassId(massId, 'config.json scheduleSettings.minByMassId');
  }
  for (const massId of Object.keys(settings.fixedParticipants ?? {})) {
    checkMassId(massId, 'config.json scheduleSettings.fixedParticipants');
  }
  for (const massId of Object.keys(settings.defaultMonthlyLimits ?? {})) {
    checkMassId(massId, 'config.json scheduleSettings.defaultMonthlyLimits');
  }

  for (const p of participants) {
    for (const massId of p.restrictions?.massIds ?? []) {
      checkMassId(massId, `participants.json id ${p.id} (${p.name}) restrictions.massIds`);
    }
    for (const massId of p.availability?.massIds ?? []) {
      checkMassId(massId, `participants.json id ${p.id} (${p.name}) availability.massIds`);
    }
    for (const massId of Object.keys(p.restrictions?.monthly ?? {})) {
      checkMassId(massId, `participants.json id ${p.id} (${p.name}) restrictions.monthly`);
    }
  }

  for (const week of escalas?.schedules ?? []) {
    for (const mass of week.masses ?? []) {
      checkMassId(mass.massId, `escalas.json semana ${week.weekId} masses[]`);
    }
  }

  // missas-especiais.json não usa massId (são eventos únicos, não ligados às
  // missas fixas de config.json), mas suas roles.defined referenciam
  // participantId — checado dentro dessa própria checagem por completude.
  for (const item of missasEspeciais?.items ?? []) {
    const validParticipantIds = new Set(participants.map(p => p.id));
    for (const role of item.roles?.defined ?? []) {
      if (role.participantId != null && !validParticipantIds.has(role.participantId)) {
        foundInvalid = true;
        reportProblem(problems, `missas-especiais.json item '${item.id}' role '${role.role}' referencia participantId ${role.participantId}, que não existe em participants.json`);
      }
    }
  }

  if (!foundInvalid) reportOk('Todas as referências de massId encontradas são válidas.');
}

// ── Checagem d: contradição entre availability e restrictions ────────

function checkAvailabilityRestrictionContradictions(participants, problems) {
  console.log('\n[d] Contradições entre availability.massIds e restrictions.massIds');

  let foundContradiction = false;
  for (const p of participants) {
    const availability = p.availability?.massIds ?? [];
    const restrictions = p.restrictions?.massIds ?? [];
    if (availability.length === 0 || restrictions.length === 0) continue;

    const overlap = availability.filter(massId => restrictions.includes(massId));
    if (overlap.length > 0) {
      foundContradiction = true;
      reportProblem(problems, `id ${p.id} (${p.name}) — massId(s) ${overlap.join(', ')} aparecem em availability.massIds E restrictions.massIds ao mesmo tempo`);
    }
  }

  if (!foundContradiction) reportOk('Nenhuma contradição encontrada entre availability e restrictions.');
}

// ── Execução principal ────────────────────────────────────────────

function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log(' Validação de integridade de dados — Acólitos & Coroinhas');
  console.log('════════════════════════════════════════════════════════');

  const config = loadJSON('config.json');
  const participantsData = loadJSON('participants.json');
  const escalas = loadJSON('escalas.json');
  const missasEspeciais = loadJSON('missas-especiais.json');

  const participants = participantsData.participants ?? [];

  const problems = [];

  checkUniqueParticipantIds(participants, problems);
  checkFixedParticipantsExist(config, participants, problems);
  checkMassIdReferences(config, participants, escalas, missasEspeciais, problems);
  checkAvailabilityRestrictionContradictions(participants, problems);

  console.log('\n════════════════════════════════════════════════════════');
  if (problems.length === 0) {
    console.log(' ✅ Tudo certo');
    console.log('════════════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log(` ❌ ${problems.length} problema(s) encontrado(s)`);
    console.log('════════════════════════════════════════════════════════');
    process.exit(1);
  }
}

main();
