const { runAdaptiveValidation } = require('../services/adaptiveValidationService');

async function main() {
  const result = await runAdaptiveValidation({ writeFiles: true });
  const userCount = result.adaptiveResults.users.length;
  const interactionCount = result.adaptiveResults.users.reduce(
    (total, user) => total + user.simulatedInteractions.length,
    0
  );

  console.log(`Adaptive validation complete for ${userCount} users.`);
  console.log(`Simulated interactions: ${interactionCount}`);
  console.log('Generated files:');
  console.log('- adaptive_results.json');
  console.log('- cross_domain_results.json');
  console.log('- multi_output_results.json');
  console.log('- adaptive_summary.txt');
}

main().catch((error) => {
  console.error('Adaptive validation failed:', error.message);
  process.exit(1);
});
