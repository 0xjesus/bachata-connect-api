// scripts/reset-database.js - CREAR ESTE ARCHIVO

import primate from '@thewebchimp/primate';
import 'dotenv/config';

console.log('🔥 INICIANDO RESET COMPLETO DE BASE DE DATOS...');
console.log('⚠️  ADVERTENCIA: Esto eliminará TODOS los datos!');

async function resetDatabase() {
    try {
        await primate.setup();

        console.log('🗑️  Eliminando datos en orden correcto...');

        // 1. Eliminar comentarios de updates
        console.log('   → Eliminando comentarios de updates...');
        await primate.prisma.updateComment.deleteMany({});

        // 2. Eliminar updates de eventos
        console.log('   → Eliminando updates de eventos...');
        await primate.prisma.eventUpdate.deleteMany({});

        // 3. Eliminar retiros crypto
        console.log('   → Eliminando retiros crypto...');
        await primate.prisma.cryptoWithdrawal.deleteMany({});

        // 4. Eliminar direcciones crypto
        console.log('   → Eliminando direcciones crypto...');
        await primate.prisma.cryptoAddress.deleteMany({});

        // 5. Eliminar transacciones
        console.log('   → Eliminando transacciones...');
        await primate.prisma.transaction.deleteMany({});

        // 6. Eliminar participaciones
        console.log('   → Eliminando participaciones...');
        await primate.prisma.participation.deleteMany({});

        // 7. Eliminar tesoreros de eventos (si existe)
        try {
            console.log('   → Eliminando tesoreros de eventos...');
            await primate.prisma.eventTreasurer.deleteMany({});
        } catch (e) {
            // Puede que no exista esta tabla
            console.log('   → Tabla eventTreasurer no encontrada, continuando...');
        }

        // 8. Eliminar eventos
        console.log('   → Eliminando eventos...');
        await primate.prisma.event.deleteMany({});

        // 9. Eliminar mensajes de conversaciones (si existe)
        try {
            console.log('   → Eliminando mensajes...');
            await primate.prisma.message.deleteMany({});
        } catch (e) {
            console.log('   → Tabla message no encontrada, continuando...');
        }

        // 10. Eliminar conversaciones (si existe)
        try {
            console.log('   → Eliminando conversaciones...');
            await primate.prisma.conversation.deleteMany({});
        } catch (e) {
            console.log('   → Tabla conversation no encontrada, continuando...');
        }

        // 11. Eliminar links de recuperación
        console.log('   → Eliminando links de recuperación...');
        await primate.prisma.link.deleteMany({});

        // 12. Eliminar attachments
        console.log('   → Eliminando attachments...');
        await primate.prisma.attachment.deleteMany({});

        // 13. FINALMENTE: Eliminar usuarios
        console.log('   → Eliminando usuarios...');
        await primate.prisma.user.deleteMany({});

        console.log('✅ RESET COMPLETO EXITOSO!');
        console.log('');
        console.log('📊 RESUMEN:');
        console.log('   - Todos los usuarios eliminados');
        console.log('   - Todos los eventos eliminados');
        console.log('   - Todas las transacciones eliminadas');
        console.log('   - Todas las participaciones eliminadas');
        console.log('   - Todos los attachments eliminados');
        console.log('   - Todos los datos relacionados eliminados');
        console.log('');
        console.log('🎉 Base de datos completamente limpia y lista para usar!');

    } catch (error) {
        console.error('❌ ERROR durante el reset:', error);
        console.error('Detalles:', error.message);
    } finally {
        await primate.prisma.$disconnect();
        process.exit(0);
    }
}

// Ejecutar con confirmación
const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');

if (!confirmed) {
    console.log('');
    console.log('⚠️  ADVERTENCIA: Este script eliminará TODOS los datos de la base de datos!');
    console.log('');
    console.log('Para ejecutar el reset, usa:');
    console.log('   node scripts/reset-database.js --confirm');
    console.log('');
    process.exit(1);
}

resetDatabase();
