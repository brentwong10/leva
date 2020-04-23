var wordDetail;
var filtering= false;
var multi_res;


$.fn.showFilter = function() {
	$(this).each(function(){ $(this).show().addClass("filter")});
	return this;
};

$.fn.hideFilter = function() {
	$(this).each(function(){ $(this).hide().removeClass("filter")});
	return this;
};

$.fn.highlight = function(keyword){
	var regex = new RegExp("(?<=([.,\/#!$%\^&\*;:{}=\-_`~()]*|^))("+keyword+")(?=([.,\/#!$%\^&\*;:{}=\-_`~()]*|$))");
	$(this).children("div").each(function() {
		$(this).find("div q").html($(this).find("div q").text().replace(regex, "<span class='result-highlight'>"+keyword+"</span>"))
	});
	return this;
}

function resetImportSingleFile(){
	$("#import-step2-single").find("ul").empty();
	$("#import-step2-single").hide();
	$("#import-step1").show();
	$("#pdf").val("");
}

function resetImportMultipleFile(){
	$("#import-import-multiple-btn").attr("disabled","disabled");
	$("#import-step2-multi").find("ul").empty();
	$("#import-step2-multi").find("select").empty();
	$("#import-step2-multi").hide();
	$("#import-step1").show();
	$("#pdf-multi").val("");
}

function check_navigation_display(el) {
    if ($(el).find('li.filter').length==0 || $(el).find('li').first().is(':visible') || $(el).find('li.filter').first().is(':visible')) {
        $(el).find('.prev').attr("disabled","disabled");
    } else {
        $(el).find('.prev').removeAttr("disabled");
    }

    if ($(el).find('li').last().is(':visible') || $(el).find('li:visible').length <10) {
        $(el).find('.next').attr("disabled","disabled");
    } else {
        $(el).find('.next').removeAttr("disabled");
    }
}

function initSearchResultLayout(count){
	$("#no-of-result").html(count);
	$("#start-no-of-result").text(0);
	$("#end-no-of-result").text( (10 > count)? count: 10);
	$("#search-page-no").text(1);
}

function scanDB(table){
	if (table==null){
		table=$("#database ul li a.active").text();
	}
	let limit=parseInt($("#show-no-db").val());
	let offset=($("#current-page").text()-1)*limit;
	$("#start-no").text(offset);
	$("#db-scan-result tbody").empty();
	$.ajax({
		url: "/database/scan",
		contentType:"application/json",
		data: JSON.stringify({"table": table, "limit": limit,"offset": offset}),
		type: "POST"
	}).done(function(data, status, xhr){
		let count = data.result.length;
		$("#total-record-no").text(data.count);
		$("#end-no").text(limit>count? count+offset: offset+limit);
		let code="";
		$.each(data.result, function(i, item){
			code+="<tr>"
			$.each(data.result[i], function(j,item){
				code+="<td>"+data.result[i][j]+"</td>";
			});
			if (table=="articles"){
				code += "<td> <button type='button' class='btn btn-secondary px-3 article-edit-btn'>Edit</button> <button type='button' class='btn btn-danger px-3 article-delete-btn'>Delete</button></td>"
			}else {
				code += "<td> <button type='button' class='btn btn-danger px-3 sentence-delete-btn'>Delete</button> </td>"
			}
			code+="</tr>";
		});
		$("#db-scan-result tbody").append(code);

		$(".article-edit-btn").click(function(){
			$("#article-edit-modal").modal("show");
			$("#article-old-name").val($(this).parent().siblings().eq(1).text());
			$("#article-id").val($(this).parent().siblings().eq(0).text());
		});

		$(".sentence-delete-btn").click(function(){
			if (confirm("Are you sure to delete this sentence?")){
				$.ajax({
					url: "/database/delete",
					contentType:"application/json",
					data: JSON.stringify({"table": table, "id": $(this).parent().siblings(":first").text()}),
					type: "POST"
				}).done(function(data, status, xhr){
					alert("The Sentence is deleted");
					scanDB();
				}).fail(function(){
					alert("Failed to delete the sentence");
				});
			}
		});

		$(".article-delete-btn").click(function(){
			if (confirm("Are you sure to delete this article? All the relavant sentences would be deleted also.")){
				$.ajax({
					url: "/database/delete",
					contentType:"application/json",
					data: JSON.stringify({"table": table, "id": $(this).parent().siblings(":first").text()}),
					type: "POST"
				}).done(function(data, status, xhr){
					alert("Article is deleted");
					scanDB();
				}).fail(function(){
					alert("Failed to delete the article");
				});
			}
		});

	}).fail(function(data,status,xhr){
		console.log(data);
		console.log(status);
	});
}

//set tooltip to show the source of sentences
$(document).ready(function(){
	$('[data-toggle="tooltip"]').tooltip();
});

$(function(){
	// setup socketio
	var socket = io()

	/*
		search
	*/
	$("#search-form").on('submit', function(e){
		//prevent over clicking the search button
		$("#search-form").find(":submit").text("Loading...").attr("disabled", "disabled");
		$("#word-result-wrapper").hide();
		$("#word-detail-wrapper").hide();

		//submit the form of words
		$.ajax({
			url: "/search/word",
			data: $(this).serialize(),
			type: "POST"
		}).done(function(data, status, xhr){
			var wordList= data.wordList;

			//remove previous result
			$("#word-result-list").empty();
			$("#word-result-wrapper").show();
			$("#word-detail-wrapper").hide();

			//show total no. of result, current first no. and last record no., page number
			initSearchResultLayout(data.count);
			$("#result-filter").val("");
			filtering=false;

			// roll back the text of the search button
			$("#search-form").find(":submit").text("Search").removeAttr("disabled");

			// do not do the following actions if none is returned
			if (data.count==0){
				return
			}

			// show all the record in a list
			$.each(wordList,function(i, item){
				$("#word-result-list").append('<li class="list-group-item result filter" role="result-word"><span class="px-2 h5">'+wordList[i].base+'</span><span class="badge badge-secondary px">'+wordList[i].count+'</span></li>');
			});
			// only show the first ten record
			$('#word-result-wrapper').find('ul li:gt(9)').hideFilter();

			check_navigation_display($("#word-result-wrapper"));

			// add listener to each words in the list to show the details of each word
			$("[role='result-word']").click(function(){
				//hide the search list and show the detail of
				$("#word-detail-wrapper").show();
				$("#word-result-wrapper").hide();

				let target = $(this).find('.h5').text();
				$.ajax({
					type: "POST",
					url: "/search/wordDetail",
					data:{'keyword': target},
				}).done(function(data, status, xhr){
					wordDetail=data.wordDetail;
					$.each(wordDetail,function(i){
						$("#word-detail-list").append('<li class="list-group-item" role="result-word" id="word-list-'+i+'"><span class="panel-title"><a class="panel-title d-flex justify-content-between" data-toggle="collapse" href="#panel-'+i+'" data-target="#panel-'+i+'"><h5>'+wordDetail[i].concrete+' ['+wordDetail[i].pos[0]+']</h5><span class="oi oi-collapse-down"></span></span></a></li>');
						$.each(wordDetail[i].sid, function(j){
							$.each(wordDetail[i].sid[j], function(k){
								$("#word-list-"+i).append("<div id='panel-"+i+"' class='panel-collapse accordion-body collapse'><div class='py-2'><q data-toggle='tooltip' data-placement='top' title='"+wordDetail[i].source[j]+"'>"+wordDetail[i].sid[j][k]+"</q></div></div>");
							});
						});
						$("#word-list-"+i).highlight(wordDetail[i].concrete);
					});

				});
			});
		}).fail(function(data,status,xhr){
			// show error message in debug
			console.log(data);
		});
		return false;
	});

	$("input[name='keyword']").blur(function(){
		$(this).val($(this).val().toLowerCase());
	});

	$("#article-edit-form").on("submit", function(){
		$("#article-edit-form").find(":submit").text("Loading...").attr("disabled", "disabled");
		$.ajax({
			url: "/database/update",
			data: $(this).serialize(),
			type: "POST"
		}).done(function(data, status, xhr){
			alert("Update PDF name Successfully");
			$("#article-new-name").val("");
			$("#article-edit-modal").modal("hide");
			scanDB();
		}).fail(function(){
			alert("Failed to Update PDF name")
		}).always(function(){
			$("#article-edit-form").find(":submit").text("Update").removeAttr("disabled");
		});
			return false;
	});

	//previous page of search result
	$("#word-result-wrapper").find('.next').click(function () {
		var page= parseInt($("#search-page-no").text());
		var last = $("#word-result-list").children('li:visible:last');
		if (filtering){
			last.nextAll('.filter:lt(10)').show();
		}else{
			last.nextAll(':lt(10)').show();
		}
		last.next().prevAll().hide();
		$("#search-page-no").text(page+1);
		$("#start-no-of-result").text(page*10);
		$("#end-no-of-result").text( (page+1)*10> parseInt($("#no-of-result").text())? $("#no-of-result").text(): (page+1)*10);
		check_navigation_display($("#word-result-wrapper"));
    });

	//next page of search result
	$("#word-result-wrapper").find('.prev').click(function () {
		var page= parseInt($("#search-page-no").text());
		var first = $("#word-result-list").children('li:visible:first');
		if (filtering){
			first.prevAll('.filter:lt(10)').show();
		}else{
			first.prevAll(':lt(10)').show();
		}
		first.prev().nextAll().hide();
		$("#search-page-no").text(page-1);
		$("#start-no-of-result").text((page-2)*10);
		$("#end-no-of-result").text((page-1)*10);
		check_navigation_display($("#word-result-wrapper"));
	});

	//expand textarea
	$('#ignore_word').focus(function () {
	    $(this).addClass('expand');
	});

	//shrink textarea
	$('#ignore_word').blur(function () {
	    $(this).removeClass('expand');
	    $(this).val($(this).val().replace(/\s/g, ''));
	});

	//go back from work detail page to search list page
	$("#back-to-result-btn").click(function(){
		$("#word-detail-wrapper").hide();
		$("#word-result-wrapper").show();
		$("#word-detail-list").empty();
	});

	//add textbox for new keyword
	$("#add-keyword-btn").click(function(){
		let str= `<div class="col-sm-6 col-md-6">
					<div class="row p-1 m-0">
						<div class="col-sm-5 p-1">
							<input type="text" placeholder="Keyword" name="keyword" class="keyword-textbox w-100 rounded-pill" autocomplete="off">
						</div>
						<div class="col-sm-3 p-1">
							<select class="keyword-pos w-100 rounded-pill" name="keyword-pos">
								<option value="all" selected>All</option><option value="VERB">Verb</option>
								<option value="NOUN">Noun</option><option value="ADJECTIVE">Adjective</option>
								<option value="ADVERB">Adverb</option><option value="OTHERS">Others</option>
							</select>
						</div>
						<div class="col-sm-3 p-1">
							<select class="keyword-dep w-100 rounded-pill" name="keyword-dep">
								<option value="all" selected>All</option>
								<option value="subj">Subject</option><option value="obj">Object</option>
							</select>
						</div>
						<div class="col-sm-1 p-1 my-auto">
							<button type="button" name="del-keyword-btn" class="btn btn-danger rounded-circle">&times;</button>
						</div>
					</div>
				</div>`;
		$(str).insertBefore($(this).parent().parent());

		$(this).parent().parent().prev().find("button").click(function(){
			$(this).parent().parent().parent().remove();
		});
	});

	$("#result-filter").on("input", function(){
		var val= $(this).val();
		filtering= true;
		if (val!=""){
			$('#word-result-wrapper')
			.find('ul li').hideFilter().end()
			.find('li:contains("'+val+'")').showFilter();
			initSearchResultLayout($('#word-result-wrapper').find('ul li.filter').length);
			$('#word-result-wrapper').find('ul li.filter:gt(9)').hide();
		}else{
			$('#word-result-wrapper')
			.find('ul li').showFilter().end();
			initSearchResultLayout($('#word-result-wrapper').find('ul li:visible').length);
			$('#word-result-wrapper').find('ul li:gt(9)').hide();
		}

		check_navigation_display($("#word-result-wrapper"));
	})

	/*
		database
	*/
	$("#database ul li a").click(function(){
		$("#current-page").text("1");
		if ($(this).text()=="articles"){
			$("#table-header").html('<th scope="col">#</th><th scope="col">Article</th><th scope="col">Options</th>');
		}else if ($(this).text()=="sentences"){
			$("#table-header").html('<th scope="col">#</th><th scope="col">Sentence</th><th scope="col">Article ID</th><th scope="col">POS</th><th scope="col">Dependency</th><th scope="col">Base Form</th><th scope="col">Word</th><th scope="col">Options</th>');
		}
		scanDB($(this).text());
	})

	//db previous page
	$("#previous-btn").click(function(){
		let page= parseInt($('#current-page').text());
		if (page>1){
			$('#current-page').text(page-1);
			scanDB();
		}
	});

	//db next page
	$("#next-btn").click(function(){
		let page= parseInt($('#current-page').text());
		if (parseInt($("#total-record-no").text())> parseInt($("#end-no").text())){
			$('#current-page').text(page+1);
			scanDB();
		}
	});

	/*
		import
	*/

	$("#pdf").change(function(){
		let selected_file = $(this).val();
		if (selected_file.length<=0){
			return;
		}
		if (selected_file.split(".").pop()!="pdf"){
			alert("Please select a pdf file!");
		}else{
			$("#auto_ignore_wrapper").detach().appendTo($("#import-single-form"));
			let form = $("#import-single-form")[0];
			$("#import-step1").hide();
			$("#loading-div").show();

			socket.on('import_single_process_response', function(msg){
				var val= (msg.code/ msg.total)*100;
				$("#prog-bar").attr("aria-valuenow", val.toString()).css("width", val.toString()+"%");
				$("#prog-percentage").text(Math.round(val,1).toString()+"% ");
				$("#prog-desc").text(msg.data);
			});

			$.ajax({
				type: "POST",
				url: "/open/single",
				contentType: false,
				processData: false,
				data: new FormData(form),
			}).done(function(data, status, xhr){
				$("#auto_ignore_wrapper").detach().prependTo($("#import-step1"));
				$("#loading-div").hide();
				$("#import-step2-single").find("ul").empty();
				$("#prog-bar").attr("aria-valuenow", 0).css("width", "0%");
				$("#prog-desc").text("");
				$("#prog-percentage").text("");

				$("#import-step2-single").show();
				$("#current-filename").text(selected_file.split("\\").pop());
				$("#single-file").val(selected_file.split("\\").pop());
				$("#import-step2-single").find("ul").append('<li class="list-group-item d-flex justify-content-between font-weight-bold"><span>Ignore</span></li>');

				$.each(data.result, function(i, item){
					item[1] = item[1].replace(/"/g, "'");
					var str="";
					str+= '<li class="list-group-item" role="result-word"> ';
					str+= '<span class="px-3"><input type="checkbox" name="cb" id="cb_'+i+'" '+ (item[0]? "checked" : "") +'></span> ';
					str+= '<span class="px-3"><input class="result-tb" type="text" name="tb" id="tb_'+i+'" value="'+item[1]+'" '+ (item[0]? "disabled" : "") +'></span> ';
					$("#import-step2-single").find("ul").append(str);
				});

				$("#single-append-btn").click(function(){
					let max_no= $("#import-step2-single ul li").length-1;
					$("#import-step2-single").find("ul").append('<li class="list-group-item" role="result-word"><span class="px-3"><input type="checkbox" name="cb" id="cb_'+max_no+'"></span><span class="px-3"><input class="result-tb" type="text" name="tb" id="tb_'+max_no+'"></span></li>');
				});
				$("input[name='cb']").change(function(){
					let id= $(this).attr('id').split('_').pop();
					id="tb_"+id;
					if ($(this).is(':checked')){
						$("input[id="+id+"]").prop('disabled', true);
					}else{
						$("input[id="+id+"]").prop('disabled', false);
					}
				});
			}).fail(function(data,status,xhr){
				console.log(data);
			}).done(function(data, status, xhr){
				//socket.off('import_process_response');
			});
		}
	});

	$("#pdf-multi").change(function(){
		//check if none is selected
		if ($(this)[0].files.length<0){
			return;
		}

		//check if there is invalid file selected
		$.each($(this)[0].files, function(i, val){
			if (val.name.split(".").pop()!="pdf"){
				alert("One of the file is not a pdf file!");
				return;
			}
		});

		$("#auto_ignore_wrapper").detach().appendTo($("#import-multi-form"));

		//start
		let form = $("#import-multi-form")[0];
		$("#import-step1").hide();
		$("#loading-div").show();

		socket.on('import_multi_process_response', function(msg){
			var val= (msg.code/ msg.total)*100;
			$("#prog-bar").attr("aria-valuenow", val.toString()).css("width", val.toString()+"%");
			$("#prog-percentage").text(Math.round(val,1).toString()+"% ");
			$("#prog-desc").text(msg.data);
		});

		$.ajax({
			type: "POST",
			url: "/open/multiple",
			contentType: false,
			processData: false,
			data: new FormData(form),
		}).done(function(data, status, xhr){
			var sentences;
			$("#auto_ignore_wrapper").detach().prependTo($("#import-step1"));
			$("#loading-div").hide();
			$("#prog-bar").attr("aria-valuenow", 0).css("width", "0%");
			$("#prog-desc").text("");
			$("#prog-percentage").text("");
			$("#import-step2-multi").show();

			$("#import-step2-multi").find("select").append("<option disabled hidden selected>Please select</option>")
			$.each(data.result, function(i, val){
				$("#import-step2-multi").find("select").append("<option value='"+i+"'>"+i+"</option>")

			});

			multi_res= data.result;
			pdf_sentences_status= data.result;
			pdf_sentences=data.result;

			$("#import-step2-multi").find("select").change(function(){
				var pdf_name= $(this).val();
				$("#multiple-file").val(pdf_name);
				$("#import-import-multiple-btn").removeAttr("disabled");
				$("#delete-import-multiple-btn").removeAttr("disabled");
				$("#import-step2-multi").find("ul").empty();
				$.each(multi_res[pdf_name], function(i, item){
					item[1] = item[1].replace(/"/g, "'");
					$("#import-step2-multi").find("ul").append('<li class="list-group-item" role="result-word"><span class="px-3"><input type="checkbox" name="cb" id="cb_'+i+'"'+ (item[0]? "checked": "" )+ '></span><span class="px-3"><input class="result-tb" type="text" name="tb" id="tb_'+i+'" value="'+item[1]+'"'+ (item[0]? "disabled": "" )+' ></span></li>');
				});
				$("#import-step2-multi ul li input[type='text']").blur(function(){
					multi_res[pdf_name][$(this).attr("id").split("_").pop()]= [false, $(this).val()];
				});

				$("#import-step2-multi ul li input[type='checkbox']").change(function(){
					multi_res[pdf_name][$(this).attr("id").split("_").pop()]= [$(this).is(":checked"), $("#tb_"+ $(this).attr("id").split("_").pop()).val()];
				});

				$("input[name='cb']").change(function(){
					let id= $(this).attr('id').split('_').pop();
					id="tb_"+id;
					if ($(this).is(':checked')){
						$("input[id="+id+"]").prop('disabled', true);
					}else{
						$("input[id="+id+"]").prop('disabled', false);
					}
				});
			});
		}).fail(function(data,status,xhr){
			console.log(data);
		});
	});


	$("#import-single-result-form").on('submit', function(){
		$.ajax({
			url: "/import/file",
			data: $(this).serialize(),
			type: "POST"
		}).done(function(data, status, xhr){
			$("#import-step2-single").hide();
			$("#import-step1").show();
			$("#pdf").val("");
			alert("Import successful");
		}).fail(function(data,status,xhr){
			console.log(data);
			console.log(status);
		});
		return false;
	});

	$("#import-multi-result-form").on('submit', function(){
		$("#import-import-multiple-btn").attr("disabled", "disabled").text("Loading");
		$("#cancel-import-multiple-btn").attr("disabled", "disabled");
		$("#delete-import-multiple-btn").attr("disabled", "disabled");
		$("#import-step2-multi select").attr("disabled", "disabled");

		$.ajax({
			url: "/import/file",
			data: $(this).serialize(),
			type: "POST"
		}).done(function(data, status, xhr){
			$("#import-import-multiple-btn").text("Import");
			$("#cancel-import-multiple-btn").removeAttr("disabled");
			$("#import-step2-multi select").removeAttr("disabled");
			$("#import-step2-multi select option:selected").text("(Imported) "+ $("#import-step2-multi select option:selected").text()).attr("disabled","disabled");
			$("#import-step2-multi select").prop("selectedIndex", 0);
			$("#import-step2-multi").find("ul").empty();

			alert("Import successful");

			if ($("#import-step2-multi select option").not(":disabled").length==0){
				resetImportMultipleFile();
				alert("All the file are processed");
				$("#import-import-multiple-btn").attr("disabled","disabled");
			}
		}).fail(function(data,status,xhr){
			console.log(data);
			console.log(status);
		});
		return false;
	});

	$("#cancel-import-single-btn").click(function(){
		if (confirm("Do you want to cancel importing the pdf?")){
			resetImportSingleFile();
		}
	});

	$("#cancel-import-multiple-btn").click(function(){
		if (confirm("Do you want to cancel importing the pdfs?")){
			resetImportMultipleFile();
		}
	});

	$("#delete-import-multiple-btn").click(function(){
		if (confirm("Are you sure not to import this file?")){
			$("#import-step2-multi select option:selected").text("(Cancel Import) "+ $("#import-step2-multi select option:selected").text()).attr("disabled","disabled");
			$("#import-step2-multi select").prop("selectedIndex", 0);
			$("#import-import-multiple-btn").attr("disabled","disabled");
			$(this).attr("disabled","disabled");
			$("#import-step2-multi").find("ul").empty();

			if ($("#import-step2-multi select option").not(":disabled").length==0){
				resetImportMultipleFile();
				alert("All the file are processed");
			}
		}
	});

	/*
		setting
	*/

	$("#clear-db-btn").click(function(){
		$.ajax({
			url: "/database/clean",
			type: "DELETE"
		}).done(function(data, status, xhr){
			alert("Clean Database successfully.");
		}).fail(function(data, status, xhr){
			alert("Fail to clean Database.");
		})
	});

	$("#restore-db-backup-btn").click(function(){
		$.ajax({
			url: "/database/restoreBackup",
			type: "GET"
		}).done(function(data, status, xhr){
			alert("Restore Database from Backup file successfully.");
		}).fail(function(data, status, xhr){
			alert("Backup file corrupted or not exist");
		})
	});

	$("#restore-db-default-btn").click(function(){
		$.ajax({
			url: "/database/restoreDefault",
			type: "GET"
		}).done(function(data, status, xhr){
			alert("Restore Database from Default file successfully.");
		}).fail(function(data, status, xhr){
			alert("Default file corrupted or not exist");
		})
	});

	$("#make-db-backup-btn").click(function(){
		$.ajax({
			url: "/database/rewriteBackup",
			type: "GET"
		}).done(function(data, status, xhr){
			alert("Create the backup file successfully.");
		}).fail(function(data, status, xhr){
			alert("Fail to overwite the backup file.");
		})
	});
//end document.ready
});