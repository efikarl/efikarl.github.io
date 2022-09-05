jQuery(document).ready(function ($) {

  function R(s) {
    return R13(R5(s));
  }

  function R5(s) {
    var b = [], c, i = s.length, a = '0'.charCodeAt(), z = a + 10;
    while (i--) {
      c = s.charCodeAt(i);
      if (c >= a && c < z) { b[i] = String.fromCharCode(((c - a + 5) % (10)) + a); }
      else { b[i] = s.charAt(i); }
    }
    return b.join('');
  }

  function R13(s) {
    var b = [], c, i = s.length, a = 'a'.charCodeAt(), z = a + 26, A = 'A'.charCodeAt(), Z = A + 26;
    while (i--) {
      c = s.charCodeAt(i);
      if (c >= a && c < z) { b[i] = String.fromCharCode(((c - a + 13) % (26)) + a); }
      else if (c >= A && c < Z) { b[i] = String.fromCharCode(((c - A + 13) % (26)) + A); }
      else { b[i] = s.charAt(i); }
    }
    return b.join('');
  }

  var $c = $('#contact a');
  var t = 'efikarl:'
  var m = 'efikarl@yeah.com';
  $c.attr('href', R(t + m));

  var $toggle = $('.toggle');
  var $reset = $('#reset');

  $toggle.click(function () {
    var target = $(this).data('target');
    $('html').addClass(target + '-open');
  });

  $reset.click(function () {
    $('html').removeClass('menu-open else-open');
  });
});
