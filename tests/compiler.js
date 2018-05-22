describe('Compiler', () => {
    it('should render a single paragraph', function () {
        expect(Compiler.compile('abc').box.innerHTML).toEqual('<p>abc</p>');
    });

    it('should render replacements', () => {
        expect(toHTML('abc -> def')).toEqual('<p>abc \u2192 def</p>');
    });

    it('should apply replacements within emphasis', () => {
        expect(toHTML('abc *def -> hij* klm')).toEqual('<p>abc <em>def \u2192 hij</em> klm</p>');
    });
});


function toHTML(md) {
    return Compiler.compile(md).box.innerHTML;
}
