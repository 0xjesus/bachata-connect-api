// check_balances_pro.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import JunoBitsoService from '#services/juno-bitso.service.js'; // <-- Importamos tu servicio real

const prisma = new PrismaClient();

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ SCRIPT DE VERIFICACIÓN CON SERVICIO Y PRISMA EN VIVO ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // 1. Obtener hasta 3 usuarios de la base de datos que tengan una CLABE de fondeo.
  console.log('\n🔍 Obteniendo usuarios con CLABE desde la base de datos...');
  const usersToTest = await prisma.user.findMany({
    where: {
      fundingClabe: {
        not: null,
      },
    },
    take: 3,
    select: {
      id: true,
      email: true,
      fundingClabe: true,
    },
  });

  if (usersToTest.length < 2) {
    console.error('\n❌ Error: No se encontraron suficientes usuarios (se necesitan al menos 2) con una `fundingClabe` en la base de datos para realizar la comparación.');
    return;
  }

  console.log(`✅ Se encontraron ${usersToTest.length} usuarios para la prueba.`);

  // 2. Iterar sobre cada usuario y llamar al servicio para obtener el balance.
  for (const user of usersToTest) {
    console.log(`\n------------------------------------------------------------------`);
    console.log(`▶️  Probando Usuario: ${user.email} | CLABE: ${user.fundingClabe}`);
    console.log(`------------------------------------------------------------------`);

    try {
      // 3. ¡Invocamos el método real de tu servicio!
      const balanceResponse = await JunoBitsoService.getUserClabeBalance(user.fundingClabe);

      console.log('✅ Respuesta RECIBIDA desde `JunoBitsoService.getUserClabeBalance`:');
      console.log(JSON.stringify(balanceResponse, null, 2)); // Usamos 2 espacios para una bonita indentación

    } catch (error) {
      console.error(`🔴 ERROR al procesar el balance para ${user.email}:`, error.message);
    }
  }
}

main()
  .catch((e) => {
    console.error('💥 Error catastrófico en el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    // 4. Muy importante: cerrar la conexión de Prisma.
    await prisma.$disconnect();
    console.log('\n🔌 Conexión a la base de datos cerrada. Script finalizado.');
  });
