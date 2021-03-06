export interface FunctionInput {
    name: string;
    value: string;
    alias?: string;
}

export class Guid {
    public value: string;

    constructor(value: string) {
        value = value.replace(/[{}]/g, "");

        if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
            this.value = value.toUpperCase();
        } else {
            throw Error(`Id ${value} is not a valid GUID`);
        }
    }

    areEqual(compare: Guid): boolean {
        if (this === null || compare === null || this === undefined || compare === undefined) {
            return false;
        }

        return this.value.toLowerCase() === compare.value.toLowerCase();
    }
}

export interface CreatedEntity {
    id: Guid;
    uri: string;
}

export interface ChangeSet {
    queryString: string;
    entity: object;
}

export interface QueryOptions {
    includeFormattedValues?: boolean;
    includeLookupLogicalNames?: boolean;
    includeAssociatedNavigationProperties?: boolean;
    maxPageSize?: number;
    impersonateUser?: Guid;
    representation?: boolean;
}

export class WebApiBase {
    private version: string;
    private accessToken: string;
    private url: string;

    /**
     * Constructor
     * @param version Version must be 8.0, 8.1 or 8.2
     * @param accessToken Optional access token if using from outside Dynamics 365
     */
    constructor (version: string, accessToken?: string, url?: string) {
        this.version = version;
        this.accessToken = accessToken;
        this.url = url;
    }

    /**
     * Get the OData URL
     * @param queryString Query string to append to URL. Defaults to a blank string
     */
    public getClientUrl(queryString: string = ""): string {
        if (this.url != null) {
            return `${this.url}/api/data/v${this.version}/${queryString}`;
        }

        const context: Xrm.Context = typeof GetGlobalContext !== "undefined" ? GetGlobalContext() : Xrm.Page.context;
        const url: string = `${context.getClientUrl()}/api/data/v${this.version}/${queryString}`;

        return url;
    }

    /**
     * Retrieve a record from CRM
     * @param entityType Type of entity to retrieve
     * @param id Id of record to retrieve
     * @param queryString OData query string parameters
     * @param queryOptions Various query options for the query
     */
    public retrieve(entitySet: string, id: Guid, queryString?: string, queryOptions?: QueryOptions): Promise<any> {
        if (queryString != null && ! /^[?]/.test(queryString)) {
            queryString = `?${queryString}`;
        }

        let query: string = (queryString != null) ? `${entitySet}(${id.value})${queryString}` : `${entitySet}(${id.value})`;
        const req: XMLHttpRequest = this.getRequest("GET", query, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Retrieve multiple records from CRM
     * @param entitySet Type of entity to retrieve
     * @param queryString OData query string parameters
     * @param queryOptions Various query options for the query
     */
    public retrieveMultiple(entitySet: string, queryString?: string, queryOptions?: QueryOptions): Promise<any> {
        if (queryString != null && ! /^[?]/.test(queryString)) {
            queryString = `?${queryString}`;
        }

        let query: string = (queryString != null) ? entitySet + queryString : entitySet;
        const req: XMLHttpRequest = this.getRequest("GET", query, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Retrieve next page from a retrieveMultiple request
     * @param query Query from the @odata.nextlink property of a retrieveMultiple
     * @param queryOptions Various query options for the query
     */
    public getNextPage(query: string, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("GET", query, queryOptions, null, false);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Create a record in CRM
     * @param entitySet Type of entity to create
     * @param entity Entity to create
     * @param impersonateUser Impersonate another user
     */
    public create(entitySet: string, entity: object, queryOptions?: QueryOptions): Promise<CreatedEntity> {
        const req: XMLHttpRequest = this.getRequest("POST", entitySet, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        const uri: string = req.getResponseHeader("OData-EntityId");
                        const start: number = uri.indexOf("(") + 1;
                        const end: number = uri.indexOf(")", start);
                        const id: string = uri.substring(start, end);

                        const createdEntity: CreatedEntity = {
                            id: new Guid(id),
                            uri,
                        };

                        resolve(createdEntity);
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send(JSON.stringify(entity));
        });
    }

    /**
     * Create a record in CRM and return data
     * @param entitySet Type of entity to create
     * @param entity Entity to create
     * @param select Select odata query parameter
     * @param impersonateUser Impersonate another user
     */
    public createWithReturnData(entitySet: string, entity: object, select: string, queryOptions?: QueryOptions): Promise<any> {
        if (select != null && ! /^[?]/.test(select)) {
            select = `?${select}`;
        }

        // set reprensetation
        if (queryOptions == null) {
            queryOptions = {};
        }

        queryOptions.representation = true;

        const req: XMLHttpRequest = this.getRequest("POST", entitySet + select, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 201) {
                        resolve(JSON.parse(req.response));
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send(JSON.stringify(entity));
        });
    }

    /**
     * Update a record in CRM
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param entity Entity fields to update
     * @param impersonateUser Impersonate another user
     */
    public update(entitySet: string, id: Guid, entity: object, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("PATCH", `${entitySet}(${id.value})`, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send(JSON.stringify(entity));
        });
    }

    /**
     * Update a single property of a record in CRM
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param attribute Attribute to update
     * @param impersonateUser Impersonate another user
     */
    public updateProperty(entitySet: string, id: Guid, attribute: string, value: any, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("PUT", `${entitySet}(${id.value})/${attribute}`, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send(JSON.stringify({ value: value }));
        });
    }

    /**
     * Delete a record from CRM
     * @param entitySet Type of entity to delete
     * @param id Id of record to delete
     */
    public delete(entitySet: string, id: Guid): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("DELETE", `${entitySet}(${id.value})`, null);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Delete a property from a record in CRM. Non navigation properties only
     * @param entitySet Type of entity to update
     * @param id Id of record to update
     * @param attribute Attribute to delete
     */
    public deleteProperty(entitySet: string, id: Guid, attribute: string): Promise<any> {
        let queryString: string = `/${attribute}`;

        const req: XMLHttpRequest = this.getRequest("DELETE", `${entitySet}(${id.value})${queryString}`, null);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Associate two records
     * @param entitySet Type of entity for primary record
     * @param id Id of primary record
     * @param relationship Schema name of relationship
     * @param relatedEntitySet Type of entity for secondary record
     * @param relatedEntityId Id of secondary record
     * @param impersonateUser Impersonate another user
     */
    public associate(entitySet: string, id: Guid, relationship: string, relatedEntitySet: string,
        relatedEntityId: Guid, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("POST", `${entitySet}(${id.value})/${relationship}/$ref`, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            const related: object = {
                "@odata.id": this.getClientUrl(`${relatedEntitySet}(${relatedEntityId.value})`)
            };

            req.send(JSON.stringify(related));
        });
    }

    /**
     * Disassociate two records
     * @param entitySet Type of entity for primary record
     * @param id  Id of primary record
     * @param property Schema name of property or relationship
     * @param relatedEntityId Id of secondary record. Only needed for collection-valued navigation properties
     */
    public disassociate(entitySet: string, id: Guid, property: string, relatedEntityId?: Guid): Promise<any> {
        let queryString: string = property;

        if (relatedEntityId != null) {
            queryString += `(${relatedEntityId.value})`;
        }

        queryString += "/$ref";

        const req: XMLHttpRequest = this.getRequest("DELETE", `${entitySet}(${id.value})/${queryString}`, null);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send();
        });
    }

    /**
     * Execute a default or custom bound action in CRM
     * @param entitySet Type of entity to run the action against
     * @param id Id of record to run the action against
     * @param actionName Name of the action to run
     * @param inputs Any inputs required by the action
     * @param impersonateUser Impersonate another user
     */
    public boundAction(entitySet: string, id: Guid, actionName: string, inputs?: Object, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("POST", `${entitySet}(${id.value})/Microsoft.Dynamics.CRM.${actionName}`, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute a default or custom unbound action in CRM
     * @param actionName Name of the action to run
     * @param inputs Any inputs required by the action
     * @param impersonateUser Impersonate another user
     */
    public unboundAction(actionName: string, inputs?: Object, queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("POST", actionName, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute a default or custom bound action in CRM
     * @param entitySet Type of entity to run the action against
     * @param id Id of record to run the action against
     * @param functionName Name of the action to run
     * @param inputs Any inputs required by the action
     * @param impersonateUser Impersonate another user
     */
    public boundFunction(entitySet: string, id: Guid, functionName: string, inputs?: FunctionInput[],
        queryOptions?: QueryOptions): Promise<any> {
        let queryString: string = `${entitySet}(${id.value})/Microsoft.Dynamics.CRM.${functionName}(`;
        queryString = this.getFunctionInputs(queryString, inputs);

        const req: XMLHttpRequest = this.getRequest("GET", queryString, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute an unbound function in CRM
     * @param functionName Name of the action to run
     * @param inputs Any inputs required by the action
     * @param impersonateUser Impersonate another user
     */
    public unboundFunction(functionName: string, inputs?: FunctionInput[], queryOptions?: QueryOptions): Promise<any> {
        let queryString: string = `${functionName}(`;
        queryString = this.getFunctionInputs(queryString, inputs);

        const req: XMLHttpRequest = this.getRequest("GET", queryString, queryOptions);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(JSON.parse(req.response));
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            inputs != null ? req.send(JSON.stringify(inputs)) : req.send();
        });
    }

    /**
     * Execute a batch operation in CRM
     * @param batchId Unique batch id for the operation
     * @param changeSetId Unique change set id for any changesets in the operation
     * @param changeSets Array of change sets (create or update) for the operation
     * @param batchGets Array of get requests for the operation
     * @param impersonateUser Impersonate another user
     */
    public batchOperation(batchId: string, changeSetId: string, changeSets: ChangeSet[],
        batchGets: string[], queryOptions?: QueryOptions): Promise<any> {
        const req: XMLHttpRequest = this.getRequest("POST", "$batch", queryOptions, `multipart/mixed;boundary=batch_${batchId}`);

        // build post body
        const body: string[] = [];

        if (changeSets.length > 0) {
            body.push(`--batch_${batchId}`);
            body.push(`Content-Type: multipart/mixed;boundary=changeset_${changeSetId}`);
            body.push("");
        }

        // push change sets to body
        for (let i: number = 0; i < changeSets.length; i++) {
            body.push(`--changeset_${changeSetId}`);
            body.push("Content-Type: application/http");
            body.push("Content-Transfer-Encoding:binary");
            body.push(`Content-ID: ${i + 1}`);
            body.push("");
            body.push(`POST ${this.getClientUrl(changeSets[i].queryString)} HTTP/1.1`);
            body.push("Content-Type: application/json;type=entry");
            body.push("");

            body.push(JSON.stringify(changeSets[i].entity));
        }

        if (changeSets.length > 0) {
            body.push(`--changeset_${changeSetId}--`);
            body.push("");
        }

        // push get requests to body
        for (let get of batchGets) {
            body.push(`--batch_${batchId}`);
            body.push("Content-Type: application/http");
            body.push("Content-Transfer-Encoding:binary");
            body.push("");
            body.push(`GET ${this.getClientUrl(get)} HTTP/1.1`);
            body.push("Accept: application/json");
        }

        if (batchGets.length > 0) {
            body.push("");
        }

        body.push(`--batch_${batchId}--`);

        return new Promise((resolve, reject) => {
            req.onreadystatechange = () => {
                if (req.readyState === 4 /* complete */) {
                    req.onreadystatechange = null;
                    if (req.status === 200) {
                        resolve(req.response);
                    } else if (req.status === 204) {
                        resolve();
                    } else {
                        reject(JSON.parse(req.response).error);
                    }
                }
            };

            req.send(body.join("\r\n"));
        });
    }

    private getRequest(method: string, queryString: string, queryOptions: QueryOptions,
        contentType: string = "application/json; charset=utf-8", needsUrl: boolean = true): XMLHttpRequest {
        let url: string;

        if (needsUrl) {
            url = this.getClientUrl(queryString);
        } else {
            url = queryString;
        }

        // build XMLHttpRequest
        const request: XMLHttpRequest = new XMLHttpRequest();
        request.open(method, url, true);
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", contentType);
        request.setRequestHeader("OData-MaxVersion", "4.0");
        request.setRequestHeader("OData-Version", "4.0");
        request.setRequestHeader("Cache-Control", "no-cache");

        if (queryOptions != null && typeof(queryOptions) !== "undefined") {
            request.setRequestHeader("Prefer", this.getPreferHeader(queryOptions));

            if (queryOptions.impersonateUser != null) {
                request.setRequestHeader("MSCRMCallerID", queryOptions.impersonateUser.value);
            }
        }

        if (this.accessToken != null) {
            request.setRequestHeader("Authorization", `Bearer ${this.accessToken}`);
        }

        return request;
    }

    private getPreferHeader(queryOptions: QueryOptions): string {
        let prefer: string[] = [];

        // add max page size to prefer request header
        if (queryOptions.maxPageSize) {
            prefer.push(`odata.maxpagesize=${queryOptions.maxPageSize}`);
        }

        // add formatted values to prefer request header
        if (queryOptions.includeFormattedValues && queryOptions.includeLookupLogicalNames &&
            queryOptions.includeAssociatedNavigationProperties) {
            prefer.push("odata.include-annotations=\"*\"");
        } else {
            const preferExtra: string = [
                queryOptions.includeFormattedValues ? "OData.Community.Display.V1.FormattedValue" : "",
                queryOptions.includeLookupLogicalNames ? "Microsoft.Dynamics.CRM.lookuplogicalname" : "",
                queryOptions.includeAssociatedNavigationProperties ? "Microsoft.Dynamics.CRM.associatednavigationproperty" : "",
            ].filter((v, i) => {
                return v !== "";
            }).join(",");

            prefer.push("odata.include-annotations=\"" + preferExtra + "\"");
        }

        return prefer.join(",");
    }

    private getFunctionInputs(queryString: string, inputs: FunctionInput[]): string {
        if (inputs == null) {
            return queryString + ")";
        }

        let aliases: string = "?";

        for (let i: number = 0; i < inputs.length; i++) {
            queryString += inputs[i].name;

            if (inputs[i].alias) {
                queryString += `=@${inputs[i].alias},`;
                aliases += `@${inputs[i].alias}=${inputs[i].value}`;
            } else {
                queryString += `=${inputs[i].value},`;
            }
        }

        queryString = queryString.substr(0, queryString.length - 1) + ")";

        if (aliases !== "?") {
            queryString += aliases;
        }

        return queryString;
    }
}

export class WebApi extends WebApiBase {
}
