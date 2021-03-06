'use strict';

const nock = require('nock');
const sinon = require('sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));
const expect = chai.expect;
const Brain = require('../../../../lib/device/brain');
const Device = require('../../../../lib/device/index');
const config = require('../../../../lib/config');

describe('./lib/device/index.js', function() {
  const sandbox = sinon.sandbox.create();
  const BRAINADDR = '10.0.0.2';
  const CONFNAME = 'NEEO';
  const BRAINPORT = '3000';

  let brainDriver,
    callbackConf,
    callbackRequesthandler,
    callbackStop,
    configStub,
    nockScope;

  beforeEach(function() {
    configStub = sandbox.stub(config);

    configStub.brainVersionSatisfaction = '0.49.0 - 0.50.0';

    brainDriver = {
      start: function(_conf, _requestHandler) {
        callbackConf = _conf;
        callbackRequesthandler = _requestHandler;
      },
      stop: function(_conf) {
        callbackStop = _conf;
      },
    };

    sandbox.stub(Brain, 'getSubscriptions').resolves([]);

    nockScope = nock(`http://${BRAINADDR}:${BRAINPORT}`);
  });

  afterEach(function() {
    nockScope.done();
    nock.restore();
    nock.activate();
    sandbox.restore();
  });

  describe('buildCustomDevice', function() {
    context('when adaptername is missing', function() {
      it('should throw an error', function() {
        expect(function() {
          Device.buildCustomDevice();
        }).to.throw(/MISSING_ADAPTERNAME/);
      });
    });

    it('should buildCustomDevice', function() {
      const result = Device.buildCustomDevice('foo', 'bar');
      expect(result.manufacturer).to.equal('NEEO');
      expect(result.devicename).to.equal('foo');
    });
  });

  describe('startServer', function() {
    it('should start the brainDriver', function() {
      nockScope
        .post('/v1/api/registerSdkDeviceAdapter')
        .reply(200)
        .get('/systeminfo')
        .reply(200, { firmwareVersion: '0.49.0' });
      const conf = buildConfWithCustomDevice();

      return Device.startServer(conf, brainDriver).then(() => {
        expect(callbackConf.brain).to.equal(BRAINADDR);
        expect(callbackConf.name).to.equal(CONFNAME);
        expect(typeof callbackRequesthandler).to.equal('object');
      });
    });

    context('when the parameter is missing', function() {
      it('should throw an error', function() {
        return expect(Device.startServer()).rejectedWith(
          'INVALID_STARTSERVER_PARAMETER'
        );
      });
    });

    context('when the Brain version is out of configured range', function() {
      ['0.47.0', '0.50.1'].forEach(function(version) {
        it('should throw an error', function() {
          nockScope.get('/systeminfo').reply(200, {
            firmwareVersion: version
          });

          const conf = buildConfWithCustomDevice();

          return expect(Device.startServer(conf, brainDriver)).rejectedWith(
            'The Brain version must satisfy 0.49.0 - 0.50.0. Please make sure that the firmware is up-to-date.'
          );
        });
      });
    });

    context('when a device uses subscriptions', function() {
      it('should fetch the subscriptions for that device', function() {
        const device = buildValidCustomDevice()
          .registerDeviceSubscriptionHandler({
            deviceAdded: () => {},
            deviceRemoved: () => {},
            initializeDeviceList: () => {},
          });
        const conf = buildConfWithCustomDevice(device);

        nockScope
          .post('/v1/api/registerSdkDeviceAdapter')
          .reply(200)
          .get('/systeminfo')
          .reply(200, { firmwareVersion: '0.49.0' });

        return Device.startServer(conf, brainDriver)
          .then(() => {
            expect(Brain.getSubscriptions).to.have.been.calledWith(device.deviceidentifier);
          });
      });

      it('should handle subscription errors', function() {
        const device = buildValidCustomDevice()
          .registerDeviceSubscriptionHandler({
            deviceAdded: () => {},
            deviceRemoved: () => {},
            initializeDeviceList: () => {},
          });
        const conf = buildConfWithCustomDevice(device);
        Brain.getSubscriptions.rejects(new Error('unit test'));

        nockScope
          .post('/v1/api/registerSdkDeviceAdapter')
          .reply(200)
          .get('/systeminfo')
          .reply(200, { firmwareVersion: '0.49.0' });

        return Device.startServer(conf, brainDriver)
          .then(() => {
            expect(Brain.getSubscriptions).to.have.been.calledWith(device.deviceidentifier);
          });
      });
    });
  });

  describe('stopServer', function() {
    it('should stop the brainDriver', function() {
      nockScope
        .post('/v1/api/registerSdkDeviceAdapter')
        .reply(200)
        .get('/systeminfo')
        .reply(200, { firmwareVersion: '0.49.0' })
        .post('/v1/api/unregisterSdkDeviceAdapter')
        .reply(200);

      const conf = buildConfWithCustomDevice();

      return Device.startServer(conf, brainDriver)
        .then(() => {
          return Device.stopServer(conf);
        })
        .then(() => {
          expect(callbackStop.brain).to.equal(BRAINADDR);
          expect(callbackStop.name).to.equal(CONFNAME);
        });
    });

    context('when the parameter is missing', function() {
      it('should fail to stopServer', function() {
        return expect(Device.stopServer()).rejectedWith(
          'INVALID_STOPSERVER_PARAMETER'
        );
      });
    });
  });

  function buildValidCustomDevice() {
    return Device
      .buildCustomDevice('myDevice', '123')
      .addImageUrl(
        { name: 'albumcover' },
        () => 'imageURI'
      );
  }

  function buildConfWithCustomDevice(device) {
    if (!device) {
      device = buildValidCustomDevice();
    }

    return {
      port: BRAINPORT,
      brain: BRAINADDR,
      name: CONFNAME,
      devices: [device],
    };
  }
});
