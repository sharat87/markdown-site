describe('Compiler', () => {
    it('should render a single paragraph', function () {
        expect(Compiler.compile('abc').box.innerHTML).toEqual('<p>abc</p>');
    });

    it('should apply replacements', () => {
        expect(toHTML('abc <-> def')).toEqual('<p>abc \u2194 def</p>');
        expect(toHTML('abc <- def')).toEqual('<p>abc \u2190 def</p>');
        expect(toHTML('abc -> def')).toEqual('<p>abc \u2192 def</p>');
        expect(toHTML('abc <= def')).toEqual('<p>abc \u2264 def</p>');
        expect(toHTML('abc => def')).toEqual('<p>abc \u21D2 def</p>');
        expect(toHTML('abc --- def')).toEqual('<p>abc \u2014 def</p>');
        expect(toHTML('abc -- def')).toEqual('<p>abc \u2013 def</p>');
        expect(toHTML('abc >= def')).toEqual('<p>abc \u2265 def</p>');
    });

    it('should apply replacements within emphasis', () => {
        expect(toHTML('abc *def -> hij* klm')).toEqual('<p>abc <em>def \u2192 hij</em> klm</p>');
        expect(toHTML('abc *def <-> hij* klm')).toEqual('<p>abc <em>def \u2194 hij</em> klm</p>');
        expect(toHTML('abc *def <- hij* klm')).toEqual('<p>abc <em>def \u2190 hij</em> klm</p>');
        expect(toHTML('abc *def -> hij* klm')).toEqual('<p>abc <em>def \u2192 hij</em> klm</p>');
        expect(toHTML('abc *def <= hij* klm')).toEqual('<p>abc <em>def \u2264 hij</em> klm</p>');
        expect(toHTML('abc *def => hij* klm')).toEqual('<p>abc <em>def \u21D2 hij</em> klm</p>');
        expect(toHTML('abc *def --- hij* klm')).toEqual('<p>abc <em>def \u2014 hij</em> klm</p>');
        expect(toHTML('abc *def -- hij* klm')).toEqual('<p>abc <em>def \u2013 hij</em> klm</p>');
        expect(toHTML('abc *def >= hij* klm')).toEqual('<p>abc <em>def \u2265 hij</em> klm</p>');
    });

    it('should not apply replacements within code fragments', () => {
        expect(toHTML('abc `def -> hij` klm')).toEqual('<p>abc <code>def -&gt; hij</code> klm</p>');
        expect(toHTML('abc `def <-> hij` klm')).toEqual('<p>abc <code>def &lt;-&gt; hij</code> klm</p>');
        expect(toHTML('abc `def <- hij` klm')).toEqual('<p>abc <code>def &lt;- hij</code> klm</p>');
        expect(toHTML('abc `def -> hij` klm')).toEqual('<p>abc <code>def -&gt; hij</code> klm</p>');
        expect(toHTML('abc `def <= hij` klm')).toEqual('<p>abc <code>def &lt;= hij</code> klm</p>');
        expect(toHTML('abc `def => hij` klm')).toEqual('<p>abc <code>def =&gt; hij</code> klm</p>');
        expect(toHTML('abc `def --- hij` klm')).toEqual('<p>abc <code>def --- hij</code> klm</p>');
        expect(toHTML('abc `def -- hij` klm')).toEqual('<p>abc <code>def -- hij</code> klm</p>');
        expect(toHTML('abc `def >= hij` klm')).toEqual('<p>abc <code>def &gt;= hij</code> klm</p>');
    });
});


function toHTML(md) {
    return Compiler.compile(md).box.innerHTML;
}
