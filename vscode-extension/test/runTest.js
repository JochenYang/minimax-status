const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

async function main() {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    const testsRoot = path.resolve(__dirname, 'suite');

    // Add files to the test suite
    const specs = glob.sync('**/**.test.js', { cwd: testsRoot });
    specs.forEach(spec => mocha.addFile(path.resolve(testsRoot, spec)));

    // Run the mocha test
    mocha.run(failures => {
        console.error('\nTests finished with failures:', failures);
        process.exit(failures ? 1 : 0);
    });
}

main().catch(err => {
    console.error('Error running tests:', err);
    process.exit(1);
});
