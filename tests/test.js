var _ = require('underscore');
var assert = require('assert');
var game = require('../game.js');

describe('Game', function(){
  describe('#create()', function(){
    it('should properly initialize a game state', function(){
      var createdState = game.create(5,10);
      var testState = {
        rows:5,
        cols:10,
        p1:{food:1, spawn:11},
        p2:{food:1, spawn:38},
        grid:'..................................................'
      };

      assert.equal(JSON.stringify(createdState), JSON.stringify(testState));

      createdState = game.create(6,4);
      testState = {
        rows:6,
        cols:4,
        p1:{food:1, spawn:5},
        p2:{food:1, spawn:18},
        grid:'........................'
      };

      assert.equal(JSON.stringify(createdState), JSON.stringify(testState));
    });
  });
});
