'use strict';

var ngSwagger = angular.module('ngSwagger', ['ui.bootstrap', 'ngSanitize'])
.controller('SwaggerCtrl', ['$scope', '$http', function($scope, $http) {
	$scope.api = {
		resources: [],
		url: '/api/api-docs'
	};

	$scope.models = {};

	$scope.go = function() {
		$scope.api.resources = [];
		$scope.selectedResource = null;

		$http.get($scope.api.url).success(function(res) {
			for(var i=0; i<res.apis.length; i++) {
				var url = $scope.api.url + '/' + res.apis[i].path.substring(1);
				$http.get(url).success(function(res) {
					angular.extend($scope.models, res.models);
					res.name = res.resourcePath.substring(1);
					res.active = false;
					$scope.api.resources.push(res);
				});
			}
		});
	};

	$scope.selectResource = function(resource) {
		for(var i=0; i<$scope.api.resources.length; i++) {
			$scope.api.resources[i].active = false;
			if($scope.api.resources[i].name==resource.name) {
				$scope.api.resources[i].active = true;
			}
		}
	};

	$scope.orderMethod = function(operation) {
		switch(operation.method.toUpperCase()) {
			case 'GET':
				return 0;
			case 'POST':
				return 1;
			case 'PUT':
				return 2;
			case 'DELETE':
				return 3;
		}
		return 4;
	}
}])
.directive('apiOperation', function() {
	return  {
		restrict: 'E',
		replace: true,
		templateUrl: 'directives/api-operation.htm',
		scope: {
			operation: '=',
			api: '=',
			resource: '=',
			models: '=',
			isOpen: '=?'
		},
		controller: ['$scope', '$http', function($scope, $http) {
			$scope.response = null;

			var parsePath = function(path, pathParams) {
				var pathParamDefs = path.match(/\{[^/]+\}/g);
				if(pathParamDefs!=null) {
					for(var i=0; i<pathParamDefs.length; i++) {
						var parts = pathParamDefs[i].replace('{', '').replace('}', '').split(':');
						path = path.replace(pathParamDefs[i], $scope.request.data.path[parts[0]]);
					}
				}
				return path;
			}

			$scope.test = function() {
				$scope.response = null;

				var url = $scope.resource.basePath + parsePath($scope.api.path, $scope.request.data.path);
				var parseResponse = function(data, status, headers) {
					$scope.response = {
							url: url,
							body: data,
							code: status,
							headers: headers()
						};
				};

				var httpRequest = {
					method: $scope.operation.method,
					url: url,
					headers: angular.copy($scope.request.data.header),
					params: $scope.request.data.query
				};

				httpRequest.headers['Content-Type'] = $scope.request.type;
				httpRequest.headers['Accept'] = $scope.request.responseType;

				if($scope.request.data.body.body!==undefined) {
					httpRequest.data = $scope.request.data.body.body;
				} else if($scope.request.type=='multipart/form-data') {
					// Ref: http://uncorkedstudios.com/blog/multipartformdata-file-upload-with-angularjs
					httpRequest.data = new FormData();
					for(var key in $scope.request.data.body) {
						httpRequest.data.append(key, $scope.request.data.body[key]);
					}
					httpRequest.transformRequest = angular.identity;
					httpRequest.headers['Content-Type'] = undefined;
				} else {
					httpRequest.data = $scope.request.data.body;
				}

				$http(httpRequest).success(parseResponse).error(parseResponse);
			}
		}],
		link: function($scope, element, attrs, ctrl) {
			$scope.consumes = $scope.resource.consumes;
			$scope.produces = $scope.resource.produces;

			if($scope.operation.consumes!==undefined) {
				$scope.consumes = $scope.operation.consumes;
			}

			$scope.request = {
				data: {
					header: {},
					body: {},
					path: {},
					query: {}
				},
				type: $scope.consumes[0],
				responseType: $scope.produces[0]
			};

			$scope.panelClass = 'panel-default';
			switch($scope.operation.method.toLowerCase()) {
				case 'get':
					$scope.panelClass = 'panel-info';
					$scope.btnClass = 'btn-primary';
					break;
				case 'post':
					$scope.panelClass = 'panel-success';
					$scope.btnClass = 'btn-success';
					break;
				case 'put':
					$scope.panelClass = 'panel-warning';
					$scope.btnClass = 'btn-warning';
					break;
				case 'delete':
					$scope.panelClass = 'panel-danger';
					$scope.btnClass = 'btn-danger';
					break;
			}

			$scope.toggleOpen = function() {
				$scope.isOpen = !$scope.isOpen;
			}

			var modelExists = function(name, models) {
				for(var i=0; i<models.length; i++) {
					if(models[i].id==name) {
						return true;
					}
				}
				return false;
			}

			var getModels = function(type, models) {
				models = models || [];
				var model = $scope.models[type];

				if(model===undefined || model==null) {
					return models;
				}

				if(!modelExists(type, models)) {
					models.push(model);
				}

				for(var k in model.properties) {
					var prop = model.properties[k];
					var name;
					if(prop.type=='array' && prop.items['$ref']!==undefined) {
						name = prop.items['$ref'];
					} else if(prop['$ref']!==undefined) {
						name = prop['$ref'];
					} else {
						continue;
					}

					if(modelExists(name, models)) {
						continue;
					}

					models = getModels(name, models);
				}

				return models;
			}
			$scope.getModels = getModels;
		}
	};
})
// Ref: http://uncorkedstudios.com/blog/multipartformdata-file-upload-with-angularjs
.directive('fileModel', function ($parse) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var model = $parse(attrs.fileModel);
			var modelSetter = model.assign;

			element.bind('change', function () {
				scope.$apply(function () {
					modelSetter(scope, element[0].files[0]);
				});
			});
		}
	};
})
.directive('apiModel', function() {
	return {
		restrict: 'E',
		replace: true,
		templateUrl: 'directives/api-model.htm',
		scope: {
			model: '='
		}
	};
})
.filter('apiPropDef', ['$sce', function($sce) {
	return function(p, isFinal) {
		var data = '(<span class="propType">';

		if(p.type===undefined) {
			data += p['$ref'];
		} else if(p.type=='array') {
			data += 'array[' + (p.items.type===undefined? p.items['$ref'] : p.items.type) + ']';
		} else {
			data += p.type;
		}

		// TODO optional/required
		data += '</span>, <span class="propOptKey">optional</span>)';

		if(!isFinal) {
			data += ',';
		}

		return $sce.trustAsHtml(data);
	};
}])
;
