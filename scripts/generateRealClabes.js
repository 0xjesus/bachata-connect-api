// scripts/generateRealClabes.js - Script directo para generar CLABEs reales de Juno

import primate from '@thewebchimp/primate';
import JunoBitsoService from '../services/juno-bitso.service.js';

// Helper para pausas
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para verificar estado actual
async function checkClabeStatus() {
	console.log('📊 Verificando estado de CLABEs...');

	try {
		const totalUsers = await primate.prisma.user.count();
		const usersWithClabe = await primate.prisma.user.count({
			where: {
				fundingClabe: { not: null },
			},
		});
		const usersWithoutClabe = totalUsers - usersWithClabe;

		// Verificar CLABEs fake
		const possibleFakeClabes = await primate.prisma.user.count({
			where: {
				OR: [
					{ fundingClabe: { startsWith: '646180' } },
					{ fundingClabe: { startsWith: '012345' } },
					{ fundingClabe: { startsWith: '123456' } },
				],
			},
		});

		console.log(`👥 Total usuarios: ${ totalUsers }`);
		console.log(`✅ Con CLABE: ${ usersWithClabe }`);
		console.log(`❌ Sin CLABE: ${ usersWithoutClabe }`);
		console.log(`⚠️ CLABEs posiblemente fake: ${ possibleFakeClabes }`);
		console.log(`📊 Porcentaje completado: ${ ((usersWithClabe / totalUsers) * 100).toFixed(1) }%`);

		return {
			totalUsers,
			usersWithClabe,
			usersWithoutClabe,
			possibleFakeClabes,
		};

	} catch(error) {
		console.error('❌ Error verificando estado:', error.message);
		return null;
	}
}

// Función principal
async function generateRealClabes() {
	console.log('🚀 GENERADOR DE CLABEs REALES DE JUNO');
	console.log('=' * 50);

	try {
		// Inicializar Primate
		console.log('🔧 Inicializando conexión a BD...');
		await primate.setup();
		console.log('✅ Conexión establecida');

		// Estado inicial
		console.log('\n📊 ESTADO INICIAL:');
		await checkClabeStatus();

		// Obtener usuarios sin CLABE real
		console.log('\n🔍 Buscando usuarios sin CLABE real...');

		const usersWithoutClabe = await primate.prisma.user.findMany({
			where: {
				OR: [
					{ fundingClabe: null },
					{ fundingClabe: '' },
					{ fundingClabe: { startsWith: '646180' } }, // CLABEs fake
					{ fundingClabe: { startsWith: '012345' } },
					{ fundingClabe: { startsWith: '123456' } },
				],
			},
			select: {
				id: true,
				email: true,
				nicename: true,
				fundingClabe: true,
				metas: true,
			},
		});

		console.log(`📋 Encontrados ${ usersWithoutClabe.length } usuarios para procesar`);

		if(usersWithoutClabe.length === 0) {
			console.log('🎉 Todos los usuarios ya tienen CLABEs reales de Juno');
			return;
		}

		// Procesar usuarios
		let processedCount = 0;
		let errorCount = 0;
		const errors = [];

		console.log('\n🔄 INICIANDO PROCESAMIENTO...');
		console.log('=' * 30);

		for(let i = 0; i < usersWithoutClabe.length; i++) {
			const user = usersWithoutClabe[i];
			const progress = `[${ i + 1 }/${ usersWithoutClabe.length }]`;

			try {
				console.log(`\n${ progress } 👤 Procesando: ${ user.email } (ID: ${ user.id })`);

				if(user.fundingClabe) {
					console.log(`   📝 CLABE anterior (fake): ${ user.fundingClabe }`);
				}

				// Crear CLABE real en Juno
				console.log('   🔄 Llamando a Juno API...');
				const junoResponse = await JunoBitsoService.createJunoClabe();

				if(!junoResponse.success) {
					throw new Error(`Juno API error: ${ JSON.stringify(junoResponse.error) }`);
				}

				if(!junoResponse.payload || !junoResponse.payload.clabe) {
					throw new Error('Juno no devolvió una CLABE válida');
				}

				const newClabe = junoResponse.payload.clabe;
				console.log(`   📍 CLABE real generada: ${ newClabe }`);

				// Verificar que no esté duplicada
				const duplicateCheck = await primate.prisma.user.findFirst({
					where: {
						fundingClabe: newClabe,
						id: { not: user.id },
					},
				});

				if(duplicateCheck) {
					throw new Error(`CLABE duplicada: ${ newClabe } ya pertenece a usuario ${ duplicateCheck.id }`);
				}

				// Actualizar usuario
				console.log('   💾 Actualizando usuario en BD...');
				const updatedUser = await primate.prisma.user.update({
					where: { id: user.id },
					data: {
						fundingClabe: newClabe,
						metas: {
							...(user.metas || {}),
							clabeGeneratedAt: new Date().toISOString(),
							clabeSource: 'juno_real',
							oldClabe: user.fundingClabe || null,
						},
					},
				});

				console.log(`   ✅ ÉXITO: ${ user.email } → CLABE: ${ newClabe }`);
				processedCount++;

				// Pausa para no saturar Juno
				if(i < usersWithoutClabe.length - 1) {
					console.log('   ⏱️ Pausa de 1 segundo...');
					await sleep(1000);
				}

			} catch(error) {
				console.log(`   ❌ ERROR: ${ error.message }`);
				errorCount++;
				errors.push({
					userId: user.id,
					email: user.email,
					error: error.message,
				});

				// Pausa más larga en caso de error
				console.log('   ⏱️ Pausa de 2 segundos por error...');
				await sleep(2000);
			}
		}

		// Resumen final
		console.log('\n' + '=' * 50);
		console.log('📋 RESUMEN DE PROCESAMIENTO:');
		console.log(`✅ Usuarios procesados exitosamente: ${ processedCount }`);
		console.log(`❌ Errores encontrados: ${ errorCount }`);

		if(errors.length > 0) {
			console.log('\n🚨 DETALLES DE ERRORES:');
			errors.forEach((err, index) => {
				console.log(`${ index + 1 }. ${ err.email } (ID: ${ err.userId })`);
				console.log(`   Error: ${ err.error }`);
			});
		}

		// Estado final
		console.log('\n📊 ESTADO FINAL:');
		const finalStatus = await checkClabeStatus();

		// Mensaje de conclusión
		console.log('\n🎯 PROCESO COMPLETADO');
		if(errorCount === 0) {
			console.log('🎉 ¡Todos los usuarios procesados exitosamente!');
		} else {
			console.log(`⚠️ Completado con ${ errorCount } errores. Revisar logs arriba.`);
		}

		return {
			success: true,
			processed: processedCount,
			errors: errorCount,
			errorDetails: errors,
		};

	} catch(error) {
		console.error('\n💥 ERROR FATAL:', error.message);
		console.error('Stack:', error.stack);
		return {
			success: false,
			error: error.message,
		};
	}
}

// Ejecutar script
async function main() {
	try {
		await generateRealClabes();
	} catch(error) {
		console.error('💥 Error ejecutando script:', error);
		process.exit(1);
	} finally {
		console.log('\n👋 Finalizando script...');
		process.exit(0);
	}
}

// Ejecutar solo si se llama directamente
if(process.argv[1].endsWith('generateRealClabes.js')) {
	main();
}

export { generateRealClabes, checkClabeStatus };
