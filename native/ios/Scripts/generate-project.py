#!/usr/bin/env python3
"""Reproducible Xcode project generator, no third-party tooling or signing secrets."""
import hashlib, json, pathlib, plistlib
root = pathlib.Path(__file__).resolve().parents[1]
def uid(key): return hashlib.sha256(key.encode()).hexdigest()[:24].upper()
def q(s): return json.dumps(str(s))
objects = {}
def add(key, body): objects[uid(key)] = body; return uid(key)
sources = sorted(str(p.relative_to(root)) for p in (root/'Sources').rglob('*.swift'))
resources = ['Resources/Assets.xcassets','Resources/PrivacyInfo.xcprivacy','Resources/catalog-preview.json']
refs = []
for path in sources+resources+['Resources/POS/PrivacyInfo.xcprivacy','Tests/AppUITests.swift']:
    typ = 'sourcecode.swift' if path.endswith('.swift') else 'folder.assetcatalog' if path.endswith('.xcassets') else 'text.xml' if path.endswith('.xcprivacy') else 'text.json'
    refs.append(add(path, f'isa = PBXFileReference; lastKnownFileType = {typ}; path = {q(path)}; sourceTree = SOURCE_ROOT;'))
products=[];targets=[]
configs={}
for name,flag,bundle,device in [('EliasCustomer','CUSTOMER_APP','de.getraenkeelias.kunden','1,2'),('EliasPOS','POS_APP','de.getraenkeelias.kasse','2')]:
    info={'CFBundleDisplayName':'Getränke Elias' if flag=='CUSTOMER_APP' else 'Elias Kasse','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleName':'$(PRODUCT_NAME)','CFBundlePackageType':'APPL','CFBundleShortVersionString':'$(MARKETING_VERSION)','CFBundleVersion':'$(CURRENT_PROJECT_VERSION)','LSRequiresIPhoneOS':True,'UIUserInterfaceStyle':'Light','UILaunchScreen':{},'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'UISupportedInterfaceOrientations~ipad':['UIInterfaceOrientationPortrait','UIInterfaceOrientationPortraitUpsideDown','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False},'EliasBaseURL':'https://getraenke-elias.vercel.app','ITSAppUsesNonExemptEncryption':False}
    if flag=='POS_APP': info.update(NSCameraUsageDescription='Elias liest Produktbarcodes, damit du Artikel in der Kasse schnell findest.',NSLocalNetworkUsageDescription='Elias verbindet sich mit deinem freigegebenen Epson-Bondrucker im lokalen Netzwerk.')
    with (root/f'Config/{name}-Info.plist').open('wb') as f: plistlib.dump(info,f)
    for is_test in [False,True]:
        target = name+'UITests' if is_test else name
        files = ['Tests/AppUITests.swift'] if is_test else sources
        builds=[]
        for path in files: builds.append(add(target+path, f'isa = PBXBuildFile; fileRef = {uid(path)};'))
        src=add(target+'Sources', 'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(builds)+'); runOnlyForDeploymentPostprocessing = 0;')
        rbuilds=[]
        if not is_test:
            app_resources = [p if p != "Resources/PrivacyInfo.xcprivacy" or flag == "CUSTOMER_APP" else "Resources/POS/PrivacyInfo.xcprivacy" for p in resources]
            for path in app_resources: rbuilds.append(add(target+path, f'isa = PBXBuildFile; fileRef = {uid(path)};'))
        res=add(target+'Resources', 'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(rbuilds)+'); runOnlyForDeploymentPostprocessing = 0;')
        frame=add(target+'Frameworks','isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
        cfgs=[]
        for config in ['Debug','Release']:
            values={'PRODUCT_NAME':'$(TARGET_NAME)','PRODUCT_BUNDLE_IDENTIFIER':bundle+('.uitests' if is_test else ''),'SWIFT_VERSION':'5.0','SWIFT_ACTIVE_COMPILATION_CONDITIONS':flag+(' DEBUG' if config=='Debug' else ''),'IPHONEOS_DEPLOYMENT_TARGET':'17.0','SDKROOT':'iphoneos','TARGETED_DEVICE_FAMILY':device,'CODE_SIGN_STYLE':'Automatic','DEVELOPMENT_TEAM':'LCYUVY9ZZ4','GENERATE_INFOPLIST_FILE':'YES' if is_test else 'NO','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if config=='Debug' else '-O','ENABLE_TESTABILITY':'YES' if config=='Debug' else 'NO','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','SUPPORTS_MACCATALYST':'NO','CLANG_ENABLE_MODULES':'YES','SWIFT_EMIT_LOC_STRINGS':'YES','MARKETING_VERSION':'0.1.0','CURRENT_PROJECT_VERSION':'1'}
            if is_test: values.update(TEST_TARGET_NAME=name)
            else: values.update(INFOPLIST_FILE=f'Config/{name}-Info.plist',ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon')
            cfgs.append(add(target+config,'isa = XCBuildConfiguration; name = '+config+'; buildSettings = {'+''.join(k+' = '+q(v)+';' for k,v in values.items())+'};'))
        configlist=add(target+'Configs','isa = XCConfigurationList; buildConfigurations = ('+','.join(cfgs)+'); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
        product=add(target+'Product',f'isa = PBXFileReference; explicitFileType = {"wrapper.cfbundle" if is_test else "wrapper.application"}; path = {target}{".xctest" if is_test else ".app"}; sourceTree = BUILT_PRODUCTS_DIR;')
        products.append(product)
        deps=[]
        if is_test:
            proxy=add(target+'Proxy',f'isa = PBXContainerItemProxy; containerPortal = {uid("Project")}; proxyType = 1; remoteGlobalIDString = {uid(name)}; remoteInfo = {name};')
            deps.append(add(target+'Dependency',f'isa = PBXTargetDependency; target = {uid(name)}; targetProxy = {proxy};'))
        targets.append(add(target,f'isa = PBXNativeTarget; buildConfigurationList = {configlist}; buildPhases = ({src},{frame},{res}); buildRules = (); dependencies = ('+','.join(deps)+f'); name = {target}; productName = {target}; productReference = {product}; productType = "com.apple.product-type.{"bundle.ui-testing" if is_test else "application"}";'))
    scheme=f'''<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="2630" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name)}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:EliasApps.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name+'UITests')}" BuildableName="{name}UITests.xctest" BlueprintName="{name}UITests" ReferencedContainer="container:EliasApps.xcodeproj"/></TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name)}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:EliasApps.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name)}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:EliasApps.xcodeproj"/></BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>'''
    schemefolder=root/'EliasApps.xcodeproj/xcshareddata/xcschemes';schemefolder.mkdir(parents=True,exist_ok=True)
    (schemefolder/f'{name}.xcscheme').write_text(scheme)
prodgroup=add('Products','isa = PBXGroup; children = ('+','.join(products)+'); name = Products; sourceTree = "<group>";')
group=add('Root','isa = PBXGroup; children = ('+','.join(refs+[prodgroup])+'); sourceTree = "<group>";')
configs=[]
for config in ['Debug','Release']: configs.append(add('Project'+config,f'isa = XCBuildConfiguration; name = {config}; buildSettings = {{ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_MODULES = YES; }};'))
cl=add('ProjectConfigs','isa = XCConfigurationList; buildConfigurations = ('+','.join(configs)+'); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
add('Project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 2630; }}; buildConfigurationList = {cl}; compatibilityVersion = "Xcode 14.0"; developmentRegion = de; knownRegions = (de,en,Base); mainGroup = {group}; productRefGroup = {prodgroup}; projectDirPath = ""; projectRoot = ""; targets = ('+','.join(targets)+');')
(root/'EliasApps.xcodeproj/project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+''.join(k+' = { '+v+' };\n' for k,v in objects.items())+'}; rootObject = '+uid('Project')+'; }\n')
print('Generated two app targets, two UI test targets and shared schemes.')
