describe('Compiler', function () {
    it("should render a para", function () {
        const {meta, html} = Compiler.compile('abc');
        expect(html).toEqual('<p>abc</p>');
    });
});
